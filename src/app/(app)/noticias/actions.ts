"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createNote, createTask, type Actor } from "@/lib/ai/actors";
import { getContext } from "@/lib/context";
import { buildSource, KIND_LABELS, type SourceKind } from "@/lib/news/sources";
import { collectDue, collectSource, ensureNewsSetup, generateDigest, validateSource, type SourceRow } from "@/lib/news/service";
import type { ActionResult } from "@/lib/schemas";

const uuid = z.uuid();
const refresh = () => { revalidatePath("/noticias"); revalidatePath("/ajustes"); revalidatePath("/"); };
const actor = async (): Promise<Actor & { budgetCents: number }> => {
  const c = await getContext();
  const { data } = await c.supabase.from("profiles").select("ai_monthly_budget_cents").eq("user_id", c.userId).maybeSingle();
  return { supabase: c.supabase, workspaceId: c.workspaceId, userId: c.userId, timezone: c.timezone, budgetCents: data?.ai_monthly_budget_cents ?? 1000 };
};

/** «Generar ahora»: actualiza las fuentes y rehace el resumen de hoy (máx. 2 veces al día). */
export async function generateNewsNow(): Promise<ActionResult & { items?: number }> {
  const a = await actor();
  await ensureNewsSetup(a.supabase, a.workspaceId, a.userId);
  await collectDue(a.supabase, { workspaceId: a.workspaceId, staleMinutes: 30, limit: 12 });
  const r = await generateDigest(a.supabase, a, { manual: true });
  refresh();
  if (r.status === "limit") return { ok: false, error: r.error ?? "Límite de 2 al día alcanzado." };
  if (r.status === "busy") return { ok: false, error: "Se está generando ahora mismo. Espera un momento." };
  return { ok: true, items: r.items };
}

/** «Útil» / «No me interesa» (o quitar la marca). Afina la selección de los días siguientes. */
export async function setNewsFeedback(itemId: string, feedback: "useful" | "hidden" | null): Promise<ActionResult> {
  if (!uuid.safeParse(itemId).success || (feedback !== null && feedback !== "useful" && feedback !== "hidden")) return { ok: false, error: "Datos no válidos" };
  const a = await actor();
  const { error } = await a.supabase.from("news_items").update({ feedback }).eq("id", itemId).eq("workspace_id", a.workspaceId);
  if (error) return { ok: false, error: "No se pudo guardar" };
  revalidatePath("/noticias");
  return { ok: true };
}

const itemInput = z.object({ itemId: z.uuid(), title: z.string().min(1).max(400), url: z.url().max(2000), action: z.string().max(240).nullable(), summary: z.string().max(400).nullable(), outlet: z.string().max(120).nullable(), business: z.string().max(80).nullable() });

/** «Convertir en tarea»: la acción sugerida como título; el enlace y el titular en las notas. */
export async function newsToTask(input: z.infer<typeof itemInput>): Promise<ActionResult & { href?: string }> {
  const p = itemInput.safeParse(input);
  if (!p.success) return { ok: false, error: "Datos no válidos" };
  const a = await actor();
  try {
    const c = await createTask(a, { title: (p.data.action ?? `Revisar: ${p.data.title}`).slice(0, 200), business: p.data.business, notes: [p.data.title, p.data.url].join("\n") });
    return { ok: true, id: c.id, href: c.href };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "No se pudo crear la tarea" }; }
}

/** «Guardar como nota»: titular, resumen, idea y enlace con su medio. */
export async function newsToNote(input: z.infer<typeof itemInput>): Promise<ActionResult & { href?: string }> {
  const p = itemInput.safeParse(input);
  if (!p.success) return { ok: false, error: "Datos no válidos" };
  const a = await actor();
  const d = p.data;
  const body = [d.summary ?? "", d.action ? `**Qué puedes hacer:** ${d.action}` : "", `Fuente: [${d.outlet ?? "enlace"}](${d.url})`].filter(Boolean).join("\n\n");
  try {
    const c = await createNote(a, { title: d.title.slice(0, 200), body, business: d.business, tags: ["noticias"] });
    return { ok: true, id: c.id, href: c.href };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "No se pudo crear la nota" }; }
}

// ------------------------------------------------------------------ Ajustes → Noticias
const settingsSchema = z.object({ enabled: z.boolean(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), weekends: z.boolean() });
export async function saveNewsSettings(input: z.infer<typeof settingsSchema>): Promise<ActionResult> {
  const p = settingsSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Hora no válida" };
  const a = await actor();
  const { error } = await a.supabase.from("profiles").update({ news_enabled: p.data.enabled, news_time: p.data.time, news_weekends: p.data.weekends }).eq("user_id", a.userId);
  if (error) return { ok: false, error: "No se pudo guardar" };
  refresh();
  return { ok: true };
}

const KINDS = Object.keys(KIND_LABELS) as SourceKind[];
/** Añade una fuente tras comprobar que existe y responde. */
export async function addNewsSource(kind: SourceKind, input: string, topicId: string | null, lang: "es" | "en" = "es"): Promise<ActionResult & { count?: number }> {
  if (!KINDS.includes(kind) || (topicId !== null && !uuid.safeParse(topicId).success) || (lang !== "es" && lang !== "en")) return { ok: false, error: "Datos no válidos" };
  const built = buildSource(kind, input, lang);
  if ("error" in built) return { ok: false, error: built.error };
  const check = await validateSource(kind, built.url);
  if (!check.ok) return { ok: false, error: `No se ha añadido: ${check.error}` };
  const a = await actor();
  const name = (kind === "rss" || kind === "blog" || kind === "youtube") && check.title ? check.title.slice(0, 100) : built.name;
  const { data, error } = await a.supabase.from("news_sources").insert({ workspace_id: a.workspaceId, user_id: a.userId, kind, name, url: check.feedUrl.startsWith("https://") ? check.feedUrl : built.url, handle: built.handle, topic_id: topicId, lang, status: "ok", last_checked_at: new Date().toISOString() })
    .select("id, workspace_id, user_id, kind, name, url, topic_id, active, fail_count").single();
  if (error) return { ok: false, error: error.code === "23505" ? "Esa fuente ya está añadida." : "No se pudo guardar la fuente" };
  const { data: topics } = await a.supabase.from("news_topics").select("id, name, keywords").eq("workspace_id", a.workspaceId);
  await collectSource(a.supabase, data as SourceRow, topics ?? []);
  refresh();
  return { ok: true, count: check.count };
}

export async function updateNewsSource(id: string, patch: { active?: boolean; topic_id?: string | null }): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || (patch.topic_id != null && !uuid.safeParse(patch.topic_id).success)) return { ok: false, error: "Datos no válidos" };
  const a = await actor();
  const clean: { active?: boolean; topic_id?: string | null } = {};
  if (typeof patch.active === "boolean") clean.active = patch.active;
  if (patch.topic_id !== undefined) clean.topic_id = patch.topic_id;
  const { error } = await a.supabase.from("news_sources").update(clean).eq("id", id).eq("workspace_id", a.workspaceId);
  if (error) return { ok: false, error: "No se pudo guardar" };
  refresh();
  return { ok: true };
}

export async function deleteNewsSource(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Datos no válidos" };
  const a = await actor();
  const { error } = await a.supabase.from("news_sources").delete().eq("id", id).eq("workspace_id", a.workspaceId);
  if (error) return { ok: false, error: "No se pudo borrar" };
  refresh();
  return { ok: true };
}

/** Vuelve a comprobar una fuente ahora (p. ej. una marcada como caída). */
export async function checkNewsSource(id: string): Promise<ActionResult & { added?: number }> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Datos no válidos" };
  const a = await actor();
  const { data: s } = await a.supabase.from("news_sources").select("id, workspace_id, user_id, kind, name, url, topic_id, active, fail_count").eq("id", id).eq("workspace_id", a.workspaceId).maybeSingle();
  if (!s) return { ok: false, error: "No existe" };
  const { data: topics } = await a.supabase.from("news_topics").select("id, name, keywords").eq("workspace_id", a.workspaceId);
  const r = await collectSource(a.supabase, s as SourceRow, topics ?? []);
  refresh();
  return r.error ? { ok: false, error: r.error } : { ok: true, added: r.added };
}

const topicSchema = z.object({
  id: z.uuid().optional(), name: z.string().trim().min(1).max(60), description: z.string().trim().max(300).optional(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), active: z.boolean(),
});
export async function saveNewsTopic(input: z.infer<typeof topicSchema>): Promise<ActionResult> {
  const p = topicSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Revisa el nombre y las palabras clave" };
  const a = await actor();
  const { id, ...v } = p.data;
  const row = { name: v.name, description: v.description || null, keywords: v.keywords.map((k) => k.toLowerCase()), color: v.color, active: v.active };
  const { error } = id
    ? await a.supabase.from("news_topics").update(row).eq("id", id).eq("workspace_id", a.workspaceId)
    : await a.supabase.from("news_topics").insert({ ...row, workspace_id: a.workspaceId, user_id: a.userId, sort_order: 999 });
  if (error) return { ok: false, error: error.code === "23505" ? "Ya hay un tema con ese nombre" : "No se pudo guardar" };
  refresh();
  return { ok: true };
}

/** Nuevo orden de los temas (lista completa de ids). */
export async function reorderNewsTopics(ids: string[]): Promise<ActionResult> {
  if (!Array.isArray(ids) || ids.length > 50 || ids.some((i) => !uuid.safeParse(i).success)) return { ok: false, error: "Datos no válidos" };
  const a = await actor();
  for (const [i, id] of ids.entries()) await a.supabase.from("news_topics").update({ sort_order: i }).eq("id", id).eq("workspace_id", a.workspaceId);
  refresh();
  return { ok: true };
}

export async function deleteNewsTopic(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Datos no válidos" };
  const a = await actor();
  const { error } = await a.supabase.from("news_topics").delete().eq("id", id).eq("workspace_id", a.workspaceId);
  if (error) return { ok: false, error: "No se pudo borrar" };
  refresh();
  return { ok: true };
}

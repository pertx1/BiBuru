"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createExpense, createNote, createOrder, resolveExpense, resolveOrder, type Actor } from "@/lib/ai/actors";
import { proposalSchema, type Proposal } from "@/lib/ai/classify";
import { applyProposal, classifyInboxItem } from "@/lib/ai/inbox";
import { sessionAiContext } from "@/lib/ai/session";
import { getContext } from "@/lib/context";
import type { Json } from "@/lib/supabase/database.types";
import { captureSchema } from "@/lib/notes/schemas";
import type { ActionResult } from "@/lib/schemas";
import { getNow } from "@/lib/tasks/data";
import { parseQuickTask } from "@/lib/tasks/quick-parse";

const uuid = z.uuid();
const refresh = () => { revalidatePath("/bandeja"); revalidatePath("/tareas"); revalidatePath("/notas"); revalidatePath("/"); };

export type CaptureResult = { ok: true } | { ok: false; error: string; permanent: boolean };

/**
 * Recibe una captura (de la cola del dispositivo). Idempotente: reenviar el mismo `clientId` no duplica.
 * Nunca pierde: si la IA o cualquier otra cosa falla, la captura queda igualmente en la bandeja.
 */
export async function captureItem(input: z.input<typeof captureSchema>): Promise<CaptureResult> {
  const p = captureSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Captura no válida", permanent: true };
  const { supabase, workspaceId, userId } = await getContext();
  const { data: inserted, error } = await supabase.from("inbox_items").upsert(
    { workspace_id: workspaceId, user_id: userId, client_id: p.data.clientId, raw_text: p.data.text, source: p.data.source, captured_at: new Date(p.data.capturedAt).toISOString() },
    { onConflict: "workspace_id,client_id", ignoreDuplicates: true },
  ).select("id");
  if (error) { console.error("[inbox] capture:", error.message); return { ok: false, error: "No se pudo guardar", permanent: false }; }

  // La captura ya está a salvo. La IA clasifica DESPUÉS, sin bloquear; si falla, queda pendiente con reintento (cron).
  const newId = inserted?.[0]?.id;
  if (newId) {
    const ctx = await sessionAiContext().catch(() => null);
    if (ctx) after(async () => { try { await classifyInboxItem(ctx, newId); } catch (e) { console.error("[inbox] classify:", e instanceof Error ? e.message : e); } });
  }
  refresh();
  return { ok: true };
}

type Created = { kind: "task" | "note" | "event" | "goal" | "expense" | "order"; id: string };

async function markAccepted(id: string, created: Created) {
  const { supabase, workspaceId } = await getContext();
  await supabase.from("inbox_items").update({ status: "accepted", processed_at: new Date().toISOString(), proposal: { result: created } }).eq("id", id).eq("workspace_id", workspaceId);
}

/** Convierte una captura en tarea (entiende fechas: «llamar a Ana mañana a las 10»). */
export async function acceptInboxAsTask(id: string): Promise<ActionResult & { created?: Created }> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Captura no válida" };
  const { supabase, workspaceId, userId } = await getContext();
  const { data: item } = await supabase.from("inbox_items").select("raw_text, status").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!item) return { ok: false, error: "No se encontró la captura" };
  const now = await getNow();
  const q = parseQuickTask(item.raw_text, now.date, now.time);
  const { data, error } = await supabase.from("tasks").insert({
    workspace_id: workspaceId, user_id: userId, title: q.title.slice(0, 200), due_date: q.date, due_time: q.time, priority: q.priority, recurrence: q.recurrence ? { ...q.recurrence } : null,
  }).select("id").single();
  if (error) { console.error("[inbox] task:", error.message); return { ok: false, error: "No se pudo crear la tarea" }; }
  const created = { kind: "task" as const, id: data.id };
  await markAccepted(id, created);
  refresh();
  return { ok: true, id: data.id, created };
}

/** Convierte una captura en nota (primera línea = título). */
export async function acceptInboxAsNote(id: string): Promise<ActionResult & { created?: Created }> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Captura no válida" };
  const { supabase, workspaceId, userId } = await getContext();
  const { data: item } = await supabase.from("inbox_items").select("raw_text").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!item) return { ok: false, error: "No se encontró la captura" };
  const [first, ...rest] = item.raw_text.split("\n");
  const long = first.length > 80;
  const { data, error } = await supabase.from("notes").insert({
    workspace_id: workspaceId, user_id: userId, title: long ? first.slice(0, 80) : first.trim(), body: long ? item.raw_text : rest.join("\n").trim(),
  }).select("id").single();
  if (error) { console.error("[inbox] note:", error.message); return { ok: false, error: "No se pudo crear la nota" }; }
  const created = { kind: "note" as const, id: data.id };
  await markAccepted(id, created);
  refresh();
  return { ok: true, id: data.id, created };
}

export async function discardInbox(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Captura no válida" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("inbox_items").update({ status: "discarded", processed_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: "No se pudo descartar" };
  refresh();
  return { ok: true };
}

/** Deshace aceptar o descartar: la captura vuelve a la bandeja y se borra lo que se hubiera creado. */
export async function restoreInbox(id: string, created?: Created): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Captura no válida" };
  const { supabase, workspaceId } = await getContext();
  if (created && uuid.safeParse(created.id).success) {
    const table = { task: "tasks", note: "notes", event: "events", goal: "goals", expense: "expenses", order: "orders" }[created.kind];
    if (table) await supabase.from(table as "tasks").delete().eq("id", created.id).eq("workspace_id", workspaceId);
  }
  const { error } = await supabase.from("inbox_items").update({ status: "pending", processed_at: null, proposal: null }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: "No se pudo restaurar" };
  refresh();
  return { ok: true };
}

export async function editInboxText(id: string, text: string): Promise<ActionResult> {
  const p = z.object({ id: uuid, text: z.string().trim().min(1).max(10000) }).safeParse({ id, text });
  if (!p.success) return { ok: false, error: "Texto no válido" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("inbox_items").update({ raw_text: p.data.text }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: "No se pudo guardar" };
  refresh();
  return { ok: true };
}

const actorOf = async (): Promise<Actor> => { const c = await getContext(); return { supabase: c.supabase, workspaceId: c.workspaceId, userId: c.userId, timezone: c.timezone }; };

/**
 * Acepta la propuesta de la IA (tal cual o corregida por la persona). Gastos y pedidos se crean aquí, al pulsar
 * «Confirmar»: la IA nunca los escribe por su cuenta.
 */
export async function acceptProposal(id: string, edited?: unknown): Promise<ActionResult & { created?: Created }> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Captura no válida" };
  const a = await actorOf();
  const { data: item } = await a.supabase.from("inbox_items").select("raw_text, proposal").eq("id", id).eq("workspace_id", a.workspaceId).maybeSingle();
  if (!item) return { ok: false, error: "No se encontró la captura" };
  const parsed = proposalSchema.safeParse(edited ?? item.proposal);
  if (!parsed.success) return { ok: false, error: "La propuesta no es válida. Corrígela o conviértela a mano." };
  const p: Proposal = parsed.data;
  try {
    let c;
    if (p.kind === "expense" && p.expense) c = await createExpense(a, await resolveExpense(a, { business: p.business ?? "", amount_eur: p.expense.amount_eur, concept: p.expense.concept ?? p.title, category: p.expense.category, supplier: p.expense.supplier, payment_method: p.expense.payment_method, date: p.date }));
    else if (p.kind === "order" && p.order) c = await createOrder(a, await resolveOrder(a, { business: p.business ?? "", customer: p.order.customer, channel: p.order.channel, date: p.date, items: p.order.items }));
    else if (p.kind === "link") c = await createNote(a, { title: `Enlace: ${p.url ?? p.title}`.slice(0, 200), body: p.url ?? item.raw_text, tags: ["enlace"] }); // la Fase 7 los envía a Favoritos
    else c = await applyProposal(a, p);
    const created = { kind: c.kind as Created["kind"], id: c.id };
    await a.supabase.from("inbox_items").update({ status: "accepted", processed_at: new Date().toISOString(), proposal: { ...p, result: { ...created, label: c.label, href: c.href } } as unknown as Json }).eq("id", id).eq("workspace_id", a.workspaceId);
    refresh();
    revalidatePath("/negocios", "layout");
    return { ok: true, id: c.id, created };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo aplicar" };
  }
}

/** Vuelve a pedir la clasificación a la IA (por ejemplo, tras un fallo o al subir el presupuesto). */
export async function retryClassification(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Captura no válida" };
  try {
    const ctx = await sessionAiContext();
    await ctx.supabase.from("inbox_items").update({ ai_next_try_at: null, ai_attempts: 0 }).eq("id", id).eq("workspace_id", ctx.workspaceId);
    const outcome = await classifyInboxItem(ctx, id);
    refresh();
    return outcome === "retry" || outcome === "blocked" ? { ok: false, error: outcome === "blocked" ? "La IA está pausada por el presupuesto." : "La IA no ha podido clasificarla ahora. Reinténtalo en un rato." } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "La IA no está disponible" };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { nowLocal } from "@/lib/dates";
import type { ActionResult } from "@/lib/schemas";
import { reviewPeriod, type ReviewKind } from "@/lib/review/period";
import { summarizeReview } from "@/lib/review/service";
import { insertSimpleTask } from "@/lib/tasks/service";

const uuid = z.uuid();
const refresh = () => { revalidatePath("/revision"); revalidatePath("/"); };

/** «Revisado» cierra la revisión (deja de salir en Inicio); se puede reabrir. */
export async function setReviewed(id: string, reviewed: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Revisión no válida" };
  const { supabase, workspaceId, userId } = await getContext();
  const { data, error } = await supabase.from("reviews").update({ reviewed_at: reviewed ? new Date().toISOString() : null }).eq("id", id).eq("workspace_id", workspaceId).eq("user_id", userId).select("id");
  if (error || !data?.length) return { ok: false, error: "No se pudo guardar" };
  refresh();
  return { ok: true };
}

const prioritiesSchema = z.array(z.string().trim().max(200)).max(3);

/**
 * Semanal: las 3 prioridades de la semana siguiente. Se guardan en la revisión y se crean como tareas (prioridad alta, para el
 * lunes de la semana que viene). Las que ya se crearon no se repiten.
 */
export async function savePriorities(id: string, items: string[]): Promise<ActionResult & { created?: number }> {
  const p = prioritiesSchema.safeParse(items);
  if (!uuid.safeParse(id).success || !p.success) return { ok: false, error: "Datos no válidos" };
  const list = p.data.filter(Boolean);
  const ctx = await getContext();
  const { data: row } = await ctx.supabase.from("reviews").select("id, kind, period_end, priorities").eq("id", id).eq("workspace_id", ctx.workspaceId).eq("user_id", ctx.userId).maybeSingle();
  if (!row) return { ok: false, error: "Revisión no encontrada" };
  // El lunes de la semana siguiente a la revisada; si ese lunes ya pasó (revisión hecha tarde), hoy.
  const today = nowLocal(new Date(), ctx.timezone).date;
  const next = reviewPeriod(row.kind as ReviewKind, row.period_end).ahead.from;
  const due = next < today ? today : next;
  const fresh = list.filter((t) => !row.priorities.includes(t));
  let created = 0;
  for (const title of fresh) {
    const r = await insertSimpleTask(ctx, { title, notes: "Prioridad elegida en la revisión semanal.", date: due, priority: 3 });
    if (!("error" in r)) created++;
  }
  const { error } = await ctx.supabase.from("reviews").update({ priorities: list }).eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) return { ok: false, error: "No se pudo guardar" };
  refresh(); revalidatePath("/tareas");
  return { ok: true, created };
}

/** Párrafo de resumen con IA (opcional, a petición). */
export async function reviewAiSummary(id: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Revisión no válida" };
  const r = await summarizeReview(id);
  if (r.ok) revalidatePath("/revision");
  return r;
}

const prefsSchema = z.object({
  review_daily_enabled: z.boolean(), review_daily_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  review_weekly_enabled: z.boolean(), review_weekly_dow: z.number().int().min(0).max(6), review_weekly_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  review_monthly_enabled: z.boolean(), review_monthly_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
export type ReviewPrefsInput = z.infer<typeof prefsSchema>;

/** Ajustes › Revisiones: a qué hora (y qué día la semanal) se generan y avisan. */
export async function saveReviewPrefs(input: ReviewPrefsInput): Promise<ActionResult> {
  const p = prefsSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Revisa las horas" };
  const { supabase, userId } = await getContext();
  const { error } = await supabase.from("profiles").update(p.data).eq("user_id", userId);
  if (error) return { ok: false, error: "No se pudo guardar" };
  revalidatePath("/ajustes");
  return { ok: true };
}

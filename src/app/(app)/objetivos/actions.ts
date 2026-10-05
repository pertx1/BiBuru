"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { startOfMonth } from "@/lib/dates";
import { toCents } from "@/lib/money";
import type { ActionResult } from "@/lib/schemas";
import { goalSchema, type GoalInput } from "@/lib/tasks/schemas";
import { getNow } from "@/lib/tasks/data";

const uuid = z.uuid();
const refresh = () => { revalidatePath("/objetivos"); revalidatePath("/negocios", "layout"); revalidatePath("/"); };
const fail = (op: string, e: { message: string }): ActionResult => { console.error(`[goals] ${op}:`, e.message); return { ok: false, error: "No se pudo guardar. Inténtalo de nuevo." }; };

export async function saveGoal(input: GoalInput): Promise<ActionResult> {
  const p = goalSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos no válidos" };
  const g = p.data;
  const target = g.measure_type === "milestones" ? 0 : g.target ? toCents(g.target) : 0;
  if (target === null || target < 0) return { ok: false, error: "El valor objetivo no es válido" };
  if (g.measure_type !== "milestones" && g.auto_source !== "tasks" && target === 0) return { ok: false, error: "Indica el valor objetivo" };
  if (g.period_start && g.deadline && g.deadline < g.period_start) return { ok: false, error: "La fecha límite es anterior al inicio" };
  const { supabase, workspaceId, userId } = await getContext();
  const today = (await getNow()).date;
  const row = {
    title: g.title, description: g.description ?? null, business_id: g.business_id ?? null, measure_type: g.measure_type, target_value: target,
    auto_source: g.measure_type === "milestones" ? null : (g.auto_source ?? null), period_start: g.period_start ?? (g.auto_source === "income" || g.auto_source === "profit" ? startOfMonth(today) : null), deadline: g.deadline ?? null,
  };
  if (g.id) {
    const { data: ex } = await supabase.from("goals").select("id").eq("id", g.id).eq("workspace_id", workspaceId).maybeSingle();
    if (ex) {
      const { error } = await supabase.from("goals").update(row).eq("id", g.id).eq("workspace_id", workspaceId);
      if (error) return fail("update", error);
      refresh();
      return { ok: true, id: g.id };
    }
  }
  const { data, error } = await supabase.from("goals").insert({ ...row, id: g.id, workspace_id: workspaceId, user_id: userId }).select("id").single();
  if (error) return fail("insert", error);
  refresh();
  return { ok: true, id: data.id };
}

/** Actualiza el avance a mano y deja constancia en el histórico (un punto por día). */
export async function setGoalProgress(id: string, value: string, note?: string): Promise<ActionResult> {
  const p = z.object({ id: uuid, value: z.string().min(1), note: z.string().trim().max(500).optional() }).safeParse({ id, value, note });
  if (!p.success) return { ok: false, error: "Datos no válidos" };
  const v = toCents(p.data.value);
  if (v === null) return { ok: false, error: "El valor no es válido" };
  const { supabase, workspaceId, userId } = await getContext();
  const { data: goal } = await supabase.from("goals").select("id, target_value, status, measure_type").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!goal) return { ok: false, error: "No se encontró el objetivo" };
  const reached = goal.target_value > 0 && v >= goal.target_value;
  const { error } = await supabase.from("goals").update({
    current_value: v, ...(reached && goal.status === "active" ? { status: "completed", completed_at: new Date().toISOString() } : {}),
  }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return fail("progress", error);
  const today = (await getNow()).date;
  const { error: e2 } = await supabase.from("goal_progress").upsert(
    { workspace_id: workspaceId, user_id: userId, goal_id: id, recorded_on: today, value: v, note: p.data.note ?? null }, { onConflict: "goal_id,recorded_on" },
  );
  if (e2) return fail("progress.history", e2);
  refresh();
  return { ok: true };
}

/** Guarda en el histórico el valor automático actual (si cambió) sin tocar nada más. */
export async function snapshotGoal(id: string, valueFixed: number): Promise<void> {
  if (!uuid.safeParse(id).success || !Number.isSafeInteger(valueFixed)) return;
  const { supabase, workspaceId, userId } = await getContext();
  const today = (await getNow()).date;
  const { data: last } = await supabase.from("goal_progress").select("value").eq("goal_id", id).eq("workspace_id", workspaceId).order("recorded_on", { ascending: false }).limit(1).maybeSingle();
  if (last?.value === valueFixed) return;
  await supabase.from("goal_progress").upsert({ workspace_id: workspaceId, user_id: userId, goal_id: id, recorded_on: today, value: valueFixed }, { onConflict: "goal_id,recorded_on" });
}

export async function setGoalStatus(id: string, status: "active" | "completed" | "archived"): Promise<ActionResult> {
  const p = z.object({ id: uuid, status: z.enum(["active", "completed", "archived"]) }).safeParse({ id, status });
  if (!p.success) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("goals").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return fail("status", error);
  refresh();
  return { ok: true };
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Objetivo no válido" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("goals").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return fail("delete", error);
  refresh();
  return { ok: true };
}

export async function addMilestone(goalId: string, title: string): Promise<ActionResult> {
  const p = z.object({ goalId: uuid, title: z.string().trim().min(1, "Escribe el hito").max(200) }).safeParse({ goalId, title });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos no válidos" };
  const { supabase, workspaceId, userId } = await getContext();
  const { error } = await supabase.from("goal_milestones").insert({ workspace_id: workspaceId, user_id: userId, goal_id: p.data.goalId, title: p.data.title, sort_order: Date.now() % 2_000_000_000 });
  if (error) return fail("milestone.add", error);
  refresh();
  return { ok: true };
}

export async function toggleMilestone(id: string, done: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Hito no válido" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("goal_milestones").update({ done }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return fail("milestone.toggle", error);
  refresh();
  return { ok: true };
}

export async function deleteMilestone(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Hito no válido" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("goal_milestones").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return fail("milestone.delete", error);
  refresh();
  return { ok: true };
}

/** Día y hora de la revisión semanal de objetivos (Ajustes). */
export async function saveWeeklyReview(dow: number, time: string): Promise<ActionResult> {
  const p = z.object({ dow: z.number().int().min(0).max(6), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }).safeParse({ dow, time });
  if (!p.success) return { ok: false, error: "Datos no válidos" };
  const { supabase, userId } = await getContext();
  const { error } = await supabase.from("profiles").update({ weekly_review_dow: p.data.dow, weekly_review_time: p.data.time }).eq("user_id", userId);
  if (error) return fail("review", error);
  revalidatePath("/ajustes");
  return { ok: true };
}

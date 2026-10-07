"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { addDays, nowLocal } from "@/lib/dates";
import { normalizeText } from "@/lib/production/text";
import { isoDate, type ActionResult } from "@/lib/schemas";
import { createTaskSchema, fieldsToRow, firstIssue, taskFieldsSchema, type TaskFields } from "@/lib/tasks/input";
import { parseQuickTask } from "@/lib/tasks/quick-parse";
import * as svc from "@/lib/tasks/service";

/**
 * Acciones de Tareas (la «API» de Antola como Server Actions). El usuario y el espacio salen siempre de la sesión;
 * una tarea de otro espacio responde como si no existiera («No se encontró la tarea», el 404 de Antola).
 */
const uuid = z.uuid();
const NOT_FOUND = { ok: false as const, error: "No se encontró la tarea", notFound: true as const };
const refresh = () => {
  revalidatePath("/tareas", "layout");
  revalidatePath("/calendario");
  revalidatePath("/objetivos");
  revalidatePath("/negocios", "layout");
  revalidatePath("/");
};
const fail = (op: string, e: { message: string }): { ok: false; error: string } => {
  console.error(`[tasks] ${op}:`, e.message);
  return { ok: false, error: "No se pudo guardar. Inténtalo de nuevo." };
};
type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string; notFound?: true };

/** Comprueba que el negocio y el objetivo son del espacio (si no, se quitan). */
async function ownRefs(ctx: Awaited<ReturnType<typeof getContext>>, businessId: string | null, goalId: string | null) {
  const [b, g] = await Promise.all([
    businessId ? ctx.supabase.from("businesses").select("id").eq("id", businessId).eq("workspace_id", ctx.workspaceId).maybeSingle() : Promise.resolve({ data: null }),
    goalId ? ctx.supabase.from("goals").select("id").eq("id", goalId).eq("workspace_id", ctx.workspaceId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { business_id: b.data?.id ?? null, goal_id: g.data?.id ?? null };
}

/** Crear con el formulario completo (hasta 50 subtareas). `inbox` = quedó en la Bandeja (sin fecha ni negocio). */
export async function createTask(input: { fields: TaskFields; subtasks?: string[] }): Promise<Res<{ id: string; inbox: boolean }>> {
  const p = createTaskSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  const ctx = await getContext();
  const row = fieldsToRow(p.data.fields, ctx.timezone);
  const refs = await ownRefs(ctx, row.business_id, row.goal_id);
  const { data, error } = await ctx.supabase.from("tasks").insert({ ...row, ...refs, workspace_id: ctx.workspaceId, user_id: ctx.userId }).select("id, repeat").single();
  if (error) return fail("create", error);
  if (data.repeat !== "none") await ctx.supabase.from("tasks").update({ series_id: data.id }).eq("id", data.id);
  if (p.data.subtasks.length) {
    const { error: e } = await ctx.supabase.from("subtasks").insert(p.data.subtasks.map((title, i) => ({ workspace_id: ctx.workspaceId, user_id: ctx.userId, task_id: data.id, title, position: i })));
    if (e) return fail("create.subtasks", e);
  }
  refresh();
  return { ok: true, id: data.id, inbox: !row.due_date && !refs.business_id };
}

/** Guardar cambios del formulario. */
export async function updateTask(id: string, fields: TaskFields): Promise<Res> {
  if (!uuid.safeParse(id).success) return NOT_FOUND;
  const p = taskFieldsSchema.safeParse(fields);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  const ctx = await getContext();
  const { data: cur } = await ctx.supabase.from("tasks").select("id, status, series_id, repeat").eq("id", id).eq("workspace_id", ctx.workspaceId).maybeSingle();
  if (!cur) return NOT_FOUND;
  const row = fieldsToRow(p.data, ctx.timezone);
  const refs = await ownRefs(ctx, row.business_id, row.goal_id);
  // Una tarea hecha no vuelve a avisar.
  const { error } = await ctx.supabase.from("tasks").update({
    ...row, ...refs, remind_at: cur.status === "done" ? null : row.remind_at, series_id: row.repeat !== "none" ? (cur.series_id ?? cur.id) : cur.series_id,
  }).eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) return fail("update", error);
  refresh();
  return { ok: true };
}

export async function deleteTask(id: string): Promise<Res> {
  if (!uuid.safeParse(id).success) return NOT_FOUND;
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("tasks").delete().eq("id", id).eq("workspace_id", workspaceId).select("id");
  if (error) return fail("delete", error);
  if (!data.length) return NOT_FOUND;
  refresh();
  return { ok: true };
}

/** Completar: si se repite, crea (o reutiliza) la siguiente ocurrencia y devuelve su id. */
export async function completeTask(id: string): Promise<Res<{ spawnedId: string | null }>> {
  if (!uuid.safeParse(id).success) return NOT_FOUND;
  try {
    const r = await svc.completeTask(await getContext(), id);
    if (!r) return NOT_FOUND;
    refresh();
    return { ok: true, spawnedId: r.spawnedId };
  } catch (e) { return fail("complete", e as Error); }
}

/** Deshacer el completado: la vuelve a dejar pendiente y borra la siguiente ocurrencia si no se ha tocado. */
export async function uncompleteTask(id: string): Promise<Res> {
  if (!uuid.safeParse(id).success) return NOT_FOUND;
  if (!(await svc.uncompleteTask(await getContext(), id))) return NOT_FOUND;
  refresh();
  return { ok: true };
}

/** Posponer el aviso 15 min o 1 h. */
export async function snoozeTask(id: string, minutes: 15 | 60): Promise<Res<{ remindAt: string }>> {
  if (!uuid.safeParse(id).success || (minutes !== 15 && minutes !== 60)) return NOT_FOUND;
  const remindAt = await svc.snoozeTask(await getContext(), id, minutes);
  if (!remindAt) return NOT_FOUND;
  refresh();
  return { ok: true, remindAt };
}

/** Reprogramar varias (máx. 200) a un día. Las que no son tuyas se ignoran. */
export async function rescheduleTasks(ids: string[], dueDate: string): Promise<Res<{ updated: number }>> {
  const p = z.object({ ids: z.array(uuid).min(1).max(200), dueDate: isoDate }).safeParse({ ids, dueDate });
  if (!p.success) return { ok: false, error: "Datos no válidos" };
  const updated = await svc.rescheduleTasks(await getContext(), p.data.ids, p.data.dueDate);
  refresh();
  return { ok: true, updated };
}

/** «Mañana» en el detalle y al deslizar: la pasa a mañana (manteniendo hora y aviso). Devuelve la fecha anterior. */
export async function moveToTomorrow(id: string): Promise<Res<{ previous: string | null }>> {
  if (!uuid.safeParse(id).success) return NOT_FOUND;
  const ctx = await getContext();
  const { data: t } = await ctx.supabase.from("tasks").select("due_date").eq("id", id).eq("workspace_id", ctx.workspaceId).eq("status", "open").maybeSingle();
  if (!t) return NOT_FOUND;
  await svc.rescheduleTasks(ctx, [id], addDays(nowLocal(new Date(), ctx.timezone).date, 1));
  refresh();
  return { ok: true, previous: t.due_date };
}

/** Devuelve una tarea a la fecha que tenía (para «Deshacer» tras «Mañana»). */
export async function restoreDueDate(id: string, dueDate: string | null): Promise<Res> {
  if (!uuid.safeParse(id).success) return NOT_FOUND;
  const ctx = await getContext();
  if (dueDate === null) {
    const { data } = await ctx.supabase.from("tasks").update({ due_date: null, due_time: null, due_at: null }).eq("id", id).eq("workspace_id", ctx.workspaceId).select("id");
    if (!data?.length) return NOT_FOUND;
  } else if (!isoDate.safeParse(dueDate).success || !(await svc.rescheduleTasks(ctx, [id], dueDate))) return NOT_FOUND;
  refresh();
  return { ok: true };
}

// ----------------------------------------------------------------------------- subtareas
const subTitle = z.string().trim().min(1, "Escribe la subtarea").max(300);

export async function addSubtask(taskId: string, title: string): Promise<Res<{ id: string }>> {
  const p = z.object({ taskId: uuid, title: subTitle }).safeParse({ taskId, title });
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  const { supabase, workspaceId, userId } = await getContext();
  const { data: t } = await supabase.from("tasks").select("id").eq("id", taskId).eq("workspace_id", workspaceId).maybeSingle();
  if (!t) return NOT_FOUND;
  const { count } = await supabase.from("subtasks").select("id", { count: "exact", head: true }).eq("task_id", taskId);
  if ((count ?? 0) >= 50) return { ok: false, error: "Máximo 50 subtareas" };
  const { data, error } = await supabase.from("subtasks").insert({ workspace_id: workspaceId, user_id: userId, task_id: taskId, title: p.data.title, position: count ?? 0 }).select("id").single();
  if (error) return fail("subtask.add", error);
  refresh();
  return { ok: true, id: data.id };
}

export async function updateSubtask(id: string, patch: { title?: string; done?: boolean }): Promise<Res> {
  const p = z.object({ id: uuid, title: subTitle.optional(), done: z.boolean().optional() }).safeParse({ id, ...patch });
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  const { supabase, workspaceId } = await getContext();
  const changes = { title: p.data.title, done: p.data.done };
  const { data, error } = await supabase.from("subtasks").update(changes).eq("id", id).eq("workspace_id", workspaceId).select("id");
  if (error) return fail("subtask.update", error);
  if (!data.length) return NOT_FOUND;
  refresh();
  return { ok: true };
}

export async function deleteSubtask(id: string): Promise<Res> {
  if (!uuid.safeParse(id).success) return NOT_FOUND;
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("subtasks").delete().eq("id", id).eq("workspace_id", workspaceId).select("id");
  if (error) return fail("subtask.delete", error);
  if (!data.length) return NOT_FOUND;
  refresh();
  return { ok: true };
}

// ----------------------------------------------------------------------------- alta rápida
/** Crea una tarea desde una línea de texto («llamar a la imprenta mañana a las 10 #akerra !!»). */
export async function createTaskQuick(text: string, defaults: { businessId?: string; goalId?: string } = {}): Promise<ActionResult> {
  const t = z.string().trim().min(1).max(500).safeParse(text);
  if (!t.success) return { ok: false, error: "Escribe algo" };
  const ctx = await getContext();
  const now = nowLocal(new Date(), ctx.timezone);
  const q = parseQuickTask(t.data, now.date, now.time);

  let businessId = defaults.businessId && uuid.safeParse(defaults.businessId).success ? defaults.businessId : null;
  if (q.businessHint) {
    const { data: bs } = await ctx.supabase.from("businesses").select("id, name").eq("workspace_id", ctx.workspaceId).eq("archived", false);
    const hint = normalizeText(q.businessHint);
    const match = bs?.find((b) => normalizeText(b.name).replace(/\s+/g, "") === hint) ?? bs?.find((b) => normalizeText(b.name).replace(/\s+/g, "").startsWith(hint));
    if (match) businessId = match.id;
  }
  const refs = await ownRefs(ctx, businessId, defaults.goalId && uuid.safeParse(defaults.goalId).success ? defaults.goalId : null);
  const r = await svc.insertSimpleTask(ctx, { title: q.title, date: q.date, time: q.time, priority: q.priority, recurrence: q.recurrence, businessId: refs.business_id, goalId: refs.goal_id });
  if ("error" in r) return { ok: false, error: r.error };
  refresh();
  return { ok: true, id: r.id };
}

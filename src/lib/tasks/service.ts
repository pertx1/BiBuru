import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, nowLocal } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";
import { fieldsToRow, taskToFields } from "./input";
import { currentOccurrence, nextOccurrence, repeatFromQuick, type Repeat } from "./repeat";
import { computeTaskTiming, timingColumns, timingOn } from "./timing";

/**
 * Operaciones de tareas como en Antola (completar con siguiente ocurrencia, deshacer, poner al día las repetitivas,
 * posponer el aviso y reprogramar). Reciben el cliente: con sesión (RLS) desde las acciones, o el de servicio desde
 * el cron. Siempre filtran por espacio; si la tarea no es del espacio devuelven null/false (= 404).
 */
type Db = SupabaseClient<Database>;
export type TaskCtx = { supabase: Db; workspaceId: string; userId: string; timezone: string };
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];

const ROLL_COLS = "id, due_date, due_time, repeat, repeat_days, reminder_mode, reminder_at, reminder_minutes_before" as const;
type RollRow = Pick<TaskRow, "id" | "due_date" | "due_time" | "repeat" | "repeat_days" | "reminder_mode" | "reminder_at" | "reminder_minutes_before">;

/**
 * Una tarea repetitiva sin hacer no se queda atrasada: pasa a la ocurrencia que toca hoy (con «cada día», a hoy), con su
 * hora y su aviso de ese día. Compara la fecha anterior al actualizar para no pisar un cambio simultáneo.
 */
async function rollRows(db: Db, rows: (RollRow & { timeZone: string })[], now: Date): Promise<number> {
  let moved = 0;
  await Promise.all(rows.map(async (t) => {
    if (!t.due_date) return;
    const to = currentOccurrence(t.due_date, nowLocal(now, t.timeZone).date, t.repeat as Repeat, t.repeat_days);
    if (!to) return;
    const { data } = await db.from("tasks").update({ due_date: to, ...timingColumns(timingOn(t, t.due_date, to, t.timeZone), now) })
      .eq("id", t.id).eq("status", "open").eq("due_date", t.due_date).select("id");
    moved += data?.length ?? 0;
  }));
  return moved;
}

/** Pone al día las repetitivas atrasadas del espacio (al abrir Tareas o Inicio). */
export async function rollRecurring(ctx: TaskCtx, now = new Date()): Promise<number> {
  const today = nowLocal(now, ctx.timezone).date;
  const { data, error } = await ctx.supabase.from("tasks").select(ROLL_COLS).eq("workspace_id", ctx.workspaceId).eq("status", "open")
    .neq("repeat", "none").lt("due_date", today).limit(200);
  if (error || !data?.length) return 0;
  return rollRows(ctx.supabase, data.map((t) => ({ ...t, timeZone: ctx.timezone })), now);
}

/** Lo mismo para todos (cron horario), para que el aviso del día llegue aunque no abras la app. */
export async function rollAllRecurring(admin: Db, now = new Date()): Promise<number> {
  // Mañana en UTC cubre cualquier zona horaria; luego se afina con la de cada autor.
  const { data, error } = await admin.from("tasks").select(`${ROLL_COLS}, user_id`).eq("status", "open").neq("repeat", "none")
    .lt("due_date", addDays(nowLocal(now, "UTC").date, 1)).limit(2000);
  if (error || !data?.length) return 0;
  const { data: profiles } = await admin.from("profiles").select("user_id, timezone").in("user_id", [...new Set(data.map((t) => t.user_id))]);
  const tz = new Map((profiles ?? []).map((p) => [p.user_id, p.timezone]));
  return rollRows(admin, data.map((t) => ({ ...t, timeZone: tz.get(t.user_id) ?? "Europe/Madrid" })), now);
}

async function findTask(ctx: TaskCtx, id: string) {
  const { data } = await ctx.supabase.from("tasks").select("*").eq("id", id).eq("workspace_id", ctx.workspaceId).maybeSingle();
  return data;
}

/** Crea la siguiente ocurrencia (con sus subtareas sin hacer). `spawned_from_id` es único: un doble toque no duplica. */
async function spawnNext(ctx: TaskCtx, task: TaskRow, now: Date): Promise<string | null> {
  const today = nowLocal(now, ctx.timezone).date;
  const base = task.due_date ?? today;
  const next = nextOccurrence(base, today, task.repeat as Repeat, task.repeat_days);
  if (!next) return null;
  const { data: created, error } = await ctx.supabase.from("tasks").insert({
    workspace_id: ctx.workspaceId, user_id: ctx.userId, business_id: task.business_id, goal_id: task.goal_id, folder_id: task.folder_id,
    title: task.title, notes: task.notes, priority: task.priority, repeat: task.repeat, repeat_days: task.repeat_days,
    series_id: task.series_id ?? task.id, spawned_from_id: task.id, due_date: next, due_time: task.due_time,
    ...timingColumns(timingOn(task, base, next, ctx.timezone), now),
  }).select("id").single();
  if (error) {
    if (error.code === "23505") { // otra petición simultánea ya la creó
      const { data } = await ctx.supabase.from("tasks").select("id").eq("workspace_id", ctx.workspaceId).eq("spawned_from_id", task.id).maybeSingle();
      return data?.id ?? null;
    }
    throw new Error(error.message);
  }
  const { data: subs } = await ctx.supabase.from("subtasks").select("title, position").eq("task_id", task.id).eq("workspace_id", ctx.workspaceId);
  if (subs?.length) await ctx.supabase.from("subtasks").insert(subs.map((s) => ({ workspace_id: ctx.workspaceId, user_id: ctx.userId, task_id: created.id, title: s.title, position: s.position })));
  return created.id;
}

/** Marca como hecha. Si se repite, devuelve la siguiente ocurrencia (nueva o la que ya existía). null = no existe. */
export async function completeTask(ctx: TaskCtx, id: string, now = new Date()): Promise<{ spawnedId: string | null } | null> {
  const task = await findTask(ctx, id);
  if (!task) return null;
  if (task.status !== "done") {
    await ctx.supabase.from("tasks").update({ status: "done", completed_at: now.toISOString(), remind_at: null })
      .eq("id", id).eq("workspace_id", ctx.workspaceId).eq("status", "open");
  }
  let spawnedId: string | null = null;
  if (task.repeat !== "none") {
    const { data: existing } = await ctx.supabase.from("tasks").select("id").eq("workspace_id", ctx.workspaceId).eq("spawned_from_id", id).maybeSingle();
    spawnedId = existing?.id ?? await spawnNext(ctx, task, now);
  }
  return { spawnedId };
}

/** Deshace el completado y borra la ocurrencia generada si sigue pendiente. */
export async function uncompleteTask(ctx: TaskCtx, id: string, now = new Date()): Promise<boolean> {
  const task = await findTask(ctx, id);
  if (!task) return false;
  // El aviso vuelve si aún no ha pasado.
  const remind = task.reminder_mode === "none" ? null : fieldsToRow(taskToFields(task, ctx.timezone), ctx.timezone, now).remind_at;
  const { data } = await ctx.supabase.from("tasks").update({ status: "open", completed_at: null, remind_at: remind }).eq("id", id).eq("workspace_id", ctx.workspaceId).select("id");
  if (!data?.length) return false;
  await ctx.supabase.from("tasks").delete().eq("workspace_id", ctx.workspaceId).eq("spawned_from_id", id).eq("status", "open");
  return true;
}

/** Posponer: vuelve a avisar dentro de 15 min o 1 h (no cambia la fecha). */
export async function snoozeTask(ctx: TaskCtx, id: string, minutes: 15 | 60, now = new Date()): Promise<string | null> {
  const remindAt = new Date(now.getTime() + minutes * 60_000).toISOString();
  const { data } = await ctx.supabase.from("tasks").update({ remind_at: remindAt }).eq("id", id).eq("workspace_id", ctx.workspaceId).eq("status", "open").select("id");
  return data?.length ? remindAt : null;
}

/** Reprograma varias tareas pendientes a un día (mismas horas y avisos). Las que no son del espacio se ignoran. */
export async function rescheduleTasks(ctx: TaskCtx, ids: string[], dueDate: string, now = new Date()): Promise<number> {
  const { data: tasks } = await ctx.supabase.from("tasks").select("*").eq("workspace_id", ctx.workspaceId).eq("status", "open").in("id", ids);
  let updated = 0;
  for (const t of tasks ?? []) {
    const fields = taskToFields(t, ctx.timezone);
    // Un aviso «a una hora» se mueve los mismos días que la tarea.
    const timing = t.due_date && t.reminder_mode === "at_time" ? timingOn(t, t.due_date, dueDate, ctx.timezone) : null;
    const row = fieldsToRow({ ...fields, dueDate }, ctx.timezone, now);
    const { data } = await ctx.supabase.from("tasks").update(timing ? { ...row, ...timingColumns(timing, now) } : row).eq("id", t.id).eq("workspace_id", ctx.workspaceId).select("id");
    updated += data?.length ?? 0;
  }
  return updated;
}

export type SimpleTask = {
  title: string; notes?: string | null; date?: string | null; time?: string | null; priority?: number;
  recurrence?: { freq: string; interval: number; byweekday?: number[] } | null; businessId?: string | null; goalId?: string | null; folderId?: string | null;
};

/**
 * Alta sencilla (alta rápida, Bandeja, IA): prioridad 0 → media; «cada …» del texto → repetición de Antola;
 * con hora, aviso a esa hora. Quien llama valida negocio/objetivo/carpeta.
 */
export async function insertSimpleTask(ctx: TaskCtx, t: SimpleTask, now = new Date()): Promise<{ id: string } | { error: string }> {
  const { repeat, days } = repeatFromQuick(t.recurrence ?? null, t.date ?? null);
  const dueDate = t.date ?? (repeat !== "none" ? nowLocal(now, ctx.timezone).date : null);
  const time = dueDate ? (t.time ?? null) : null;
  const timing = timingColumns(computeTaskTiming({ dueDate, time, reminderMode: time ? "before" : "none", reminderMinutesBefore: 0 }, ctx.timezone), now);
  const { data, error } = await ctx.supabase.from("tasks").insert({
    workspace_id: ctx.workspaceId, user_id: ctx.userId, title: t.title.slice(0, 300), notes: t.notes ?? null, due_date: dueDate, due_time: time,
    priority: t.priority && t.priority >= 1 && t.priority <= 3 ? t.priority : 2, repeat, repeat_days: days,
    business_id: t.businessId ?? null, goal_id: t.goalId ?? null, folder_id: t.folderId ?? null, ...timing,
  }).select("id").single();
  if (error) { console.error("[tasks] insert:", error.message); return { error: "No se pudo crear la tarea" }; }
  if (repeat !== "none") await ctx.supabase.from("tasks").update({ series_id: data.id }).eq("id", data.id).eq("workspace_id", ctx.workspaceId);
  return { id: data.id };
}

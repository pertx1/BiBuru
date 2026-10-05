"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { normalizeText } from "@/lib/production/text";
import type { ActionResult } from "@/lib/schemas";
import { getNow } from "@/lib/tasks/data";
import { parseQuickTask } from "@/lib/tasks/quick-parse";
import { nextOccurrence, parseRecurrence } from "@/lib/tasks/recurrence";
import { taskSchema, type TaskInput } from "@/lib/tasks/schemas";
import { snooze, type SnoozeOption } from "@/lib/tasks/snooze";

const uuid = z.uuid();
const refresh = () => {
  revalidatePath("/tareas");
  revalidatePath("/calendario");
  revalidatePath("/objetivos");
  revalidatePath("/negocios", "layout");
  revalidatePath("/");
};
const fail = (op: string, e: { message: string }): ActionResult => {
  console.error(`[tasks] ${op}:`, e.message);
  return { ok: false, error: "No se pudo guardar. Inténtalo de nuevo." };
};

/** Crea una tarea desde una línea de texto ("llamar a la imprenta mañana a las 10 #akerra !!"). */
export async function createTaskQuick(text: string, defaults: { businessId?: string; goalId?: string } = {}): Promise<ActionResult> {
  const t = z.string().trim().min(1).max(500).safeParse(text);
  if (!t.success) return { ok: false, error: "Escribe algo" };
  const { supabase, workspaceId, userId } = await getContext();
  const now = await getNow();
  const q = parseQuickTask(t.data, now.date, now.time);

  let businessId = defaults.businessId && uuid.safeParse(defaults.businessId).success ? defaults.businessId : null;
  if (q.businessHint) {
    const { data: bs } = await supabase.from("businesses").select("id, name").eq("workspace_id", workspaceId).eq("archived", false);
    const hint = normalizeText(q.businessHint);
    const match = bs?.find((b) => normalizeText(b.name).replace(/\s+/g, "") === hint) ?? bs?.find((b) => normalizeText(b.name).replace(/\s+/g, "").startsWith(hint));
    if (match) businessId = match.id;
  }
  const { data, error } = await supabase.from("tasks").insert({
    workspace_id: workspaceId, user_id: userId, title: q.title, due_date: q.date, due_time: q.time, priority: q.priority,
    recurrence: q.recurrence ? { ...q.recurrence } : null, business_id: businessId, goal_id: defaults.goalId && uuid.safeParse(defaults.goalId).success ? defaults.goalId : null,
  }).select("id").single();
  if (error) return fail("quick", error);
  refresh();
  return { ok: true, id: data.id };
}

/** Guarda una tarea completa (con `id` existente actualiza; con `id` nuevo la crea: sirve para deshacer un borrado). */
export async function saveTask(input: TaskInput): Promise<ActionResult> {
  const p = taskSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos no válidos" };
  const { supabase, workspaceId, userId } = await getContext();
  const t = p.data;
  const row = {
    title: t.title, notes: t.notes ?? null, due_date: t.due_date ?? null, due_time: t.due_date ? (t.due_time ?? null) : null,
    priority: t.priority, business_id: t.business_id ?? null, goal_id: t.goal_id ?? null, parent_id: t.parent_id ?? null,
    recurrence: t.recurrence ? { ...t.recurrence } : null, status: t.status,
    completed_at: t.status === "done" ? new Date().toISOString() : null,
  };
  if (t.id) {
    const { data: existing } = await supabase.from("tasks").select("id, status").eq("id", t.id).eq("workspace_id", workspaceId).maybeSingle();
    if (existing) {
      const { completed_at, ...rest } = row;
      const { error } = await supabase.from("tasks").update({ ...rest, ...(existing.status !== t.status ? { completed_at } : {}) }).eq("id", t.id).eq("workspace_id", workspaceId);
      if (error) return fail("update", error);
      refresh();
      return { ok: true, id: t.id };
    }
  }
  const { data, error } = await supabase.from("tasks").insert({ ...row, id: t.id, workspace_id: workspaceId, user_id: userId }).select("id").single();
  if (error) return fail("insert", error);
  refresh();
  return { ok: true, id: data.id };
}

export type ToggleResult = { ok: true; nextId?: string } | { ok: false; error: string };

/**
 * Marca hecha o reabre. Al completar una tarea recurrente se crea la siguiente aparición
 * (desde hoy si se completó tarde, sin generar atrasadas) y se devuelve su id para poder deshacer.
 */
export async function toggleTask(id: string, done: boolean): Promise<ToggleResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Tarea no válida" };
  const { supabase, workspaceId, userId } = await getContext();
  const { data: task, error: e1 } = await supabase.from("tasks").select("*").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (e1 || !task) return { ok: false, error: "No se encontró la tarea" };
  if ((task.status === "done") === done) return { ok: true };

  const { error } = await supabase.from("tasks").update({ status: done ? "done" : "open", completed_at: done ? new Date().toISOString() : null }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return fail("toggle", error);

  let nextId: string | undefined;
  const rec = parseRecurrence(task.recurrence);
  if (done && rec && task.due_date && !task.parent_id) {
    const { date: today } = await getNow();
    const after = task.due_date > today ? task.due_date : today;
    const next = nextOccurrence(rec, task.due_date, after);
    if (next) {
      const { data: clone, error: e2 } = await supabase.from("tasks").insert({
        workspace_id: workspaceId, user_id: userId, title: task.title, notes: task.notes, due_date: next, due_time: task.due_time,
        priority: task.priority, business_id: task.business_id, goal_id: task.goal_id, recurrence: task.recurrence,
      }).select("id").single();
      if (e2) return fail("recurrence.next", e2);
      nextId = clone.id;
      const { data: subs } = await supabase.from("tasks").select("title, notes, priority, sort_order").eq("parent_id", id).eq("workspace_id", workspaceId);
      if (subs?.length) {
        await supabase.from("tasks").insert(subs.map((s) => ({ workspace_id: workspaceId, user_id: userId, parent_id: nextId!, title: s.title, notes: s.notes, priority: s.priority, sort_order: s.sort_order })));
      }
    }
  }
  refresh();
  return { ok: true, nextId };
}

/** Deshace una finalización: reabre la tarea y borra la aparición siguiente que se hubiera creado. */
export async function undoComplete(id: string, nextId?: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || (nextId && !uuid.safeParse(nextId).success)) return { ok: false, error: "Tarea no válida" };
  const { supabase, workspaceId } = await getContext();
  if (nextId) await supabase.from("tasks").delete().eq("id", nextId).eq("workspace_id", workspaceId);
  const { error } = await supabase.from("tasks").update({ status: "open", completed_at: null }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return fail("undoComplete", error);
  refresh();
  return { ok: true };
}

export async function snoozeTask(id: string, option: SnoozeOption): Promise<ActionResult & { previous?: { date: string | null; time: string | null } }> {
  const p = z.object({ id: uuid, option: z.enum(["1h", "tarde", "manana", "semana"]) }).safeParse({ id, option });
  if (!p.success) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId } = await getContext();
  const { data: task } = await supabase.from("tasks").select("due_date, due_time").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!task) return { ok: false, error: "No se encontró la tarea" };
  const now = await getNow();
  const next = snooze(p.data.option, now, { date: task.due_date, time: task.due_time?.slice(0, 5) ?? null });
  const { error } = await supabase.from("tasks").update({ due_date: next.date, due_time: next.time }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return fail("snooze", error);
  refresh();
  return { ok: true, previous: { date: task.due_date, time: task.due_time?.slice(0, 5) ?? null } };
}

export async function setTaskDue(id: string, due: { date: string | null; time: string | null }): Promise<ActionResult> {
  const p = z.object({ id: uuid, date: z.string().nullable(), time: z.string().nullable() }).safeParse({ id, ...due });
  if (!p.success) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("tasks").update({ due_date: p.data.date, due_time: p.data.date ? p.data.time : null }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return fail("setDue", error);
  refresh();
  return { ok: true };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Tarea no válida" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("tasks").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return fail("delete", error);
  refresh();
  return { ok: true };
}

export async function addSubtask(parentId: string, title: string): Promise<ActionResult> {
  const p = z.object({ parentId: uuid, title: z.string().trim().min(1).max(200) }).safeParse({ parentId, title });
  if (!p.success) return { ok: false, error: "Escribe un título" };
  const { supabase, workspaceId, userId } = await getContext();
  const { error } = await supabase.from("tasks").insert({ workspace_id: workspaceId, user_id: userId, parent_id: p.data.parentId, title: p.data.title });
  if (error) return fail("subtask", error);
  refresh();
  return { ok: true };
}

/** Carga una tarea con sus subtareas (para abrirla desde el calendario). */
export async function loadTask(id: string) {
  if (!uuid.safeParse(id).success) return null;
  const { getTask } = await import("@/lib/tasks/data");
  return getTask(id);
}

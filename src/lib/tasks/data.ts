import "server-only";
import { getContext } from "@/lib/context";
import { addDays, endOfMonth, nowLocal, startOfMonth } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";
import { expandEvents, postsToItems, tasksToItems, type CalItem } from "./calendar";
import { type GoalLike, type Live } from "./goals";
import { rollRecurring } from "./service";

export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type Subtask = Database["public"]["Tables"]["subtasks"]["Row"];
export type TaskWithSubs = Task & { subtasks: Subtask[] };
export type EventRow = Database["public"]["Tables"]["events"]["Row"];
export type Goal = Database["public"]["Tables"]["goals"]["Row"];
export type Milestone = Database["public"]["Tables"]["goal_milestones"]["Row"];
export type GoalProgressRow = Database["public"]["Tables"]["goal_progress"]["Row"];

/** Filtros de la lista (chips de /tareas, como Antola). «todas» = pendientes, para negocio/objetivo y widgets. */
export type TaskView = "hoy" | "semana" | "bandeja" | "sinfecha" | "hechas" | "todas";
export const TASK_VIEWS: TaskView[] = ["hoy", "semana", "bandeja", "sinfecha", "hechas"];

function fail(what: string, e: { message: string } | null): never {
  console.error(`[tasks] ${what}:`, e?.message);
  throw new Error(`No se pudo cargar: ${what}`);
}

export async function getNow() {
  const { timezone } = await getContext();
  return { timezone, ...nowLocal(new Date(), timezone) };
}

async function attachSubtasks(tasks: Task[]): Promise<TaskWithSubs[]> {
  if (tasks.length === 0) return [];
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("subtasks").select("*").eq("workspace_id", workspaceId).in("task_id", tasks.map((p) => p.id)).order("position").order("created_at");
  if (error) fail("subtareas", error);
  const by = new Map<string, Subtask[]>();
  for (const s of data) (by.get(s.task_id) ?? by.set(s.task_id, []).get(s.task_id)!).push(s);
  return tasks.map((p) => ({ ...p, subtasks: by.get(p.id) ?? [] }));
}

/** Pone al día las repetitivas atrasadas (como Antola al abrir Hoy o Tareas). Nunca lanza. */
export async function rollMine(): Promise<void> {
  try {
    const ctx = await getContext();
    await rollRecurring(ctx);
  } catch (e) { console.error("[tasks] roll", e instanceof Error ? e.message : e); }
}

/**
 * Tareas según el filtro. Orden de Antola: fecha (sin fecha al final), hora, prioridad (alta primero), creación.
 * Completadas: las 100 últimas.
 */
export async function listTasks(view: TaskView, opts: { businessId?: string; goalId?: string; roll?: boolean } = {}): Promise<TaskWithSubs[]> {
  if (view !== "hechas" && opts.roll !== false) await rollMine();
  const { supabase, workspaceId } = await getContext();
  const { date: today } = await getNow();
  let q = supabase.from("tasks").select("*").eq("workspace_id", workspaceId);
  if (opts.businessId) q = q.eq("business_id", opts.businessId);
  if (opts.goalId) q = q.eq("goal_id", opts.goalId);
  if (view === "hechas") {
    const { data, error } = await q.eq("status", "done").order("completed_at", { ascending: false }).limit(100);
    if (error) fail("tareas", error);
    return attachSubtasks(data);
  }
  q = q.eq("status", "open");
  switch (view) {
    case "hoy": q = q.lte("due_date", today); break;                                        // vencidas + hoy
    case "semana": q = q.gte("due_date", today).lte("due_date", addDays(today, 6)); break;
    case "bandeja": q = q.is("due_date", null).is("business_id", null); break;
    case "sinfecha": q = q.is("due_date", null); break;
  }
  const { data, error } = await q.order("due_date", { ascending: true, nullsFirst: false }).order("due_time", { ascending: true, nullsFirst: false })
    .order("priority", { ascending: false }).order("created_at", { ascending: true }).limit(500);
  if (error) fail("tareas", error);
  return attachSubtasks(data);
}

export async function getTask(id: string): Promise<TaskWithSubs | null> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("tasks").select("*").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  if (error) fail("tarea", error);
  return data ? (await attachSubtasks([data]))[0] : null;
}

/** Pendientes sin fecha ni negocio (contador del chip «Bandeja»). */
export async function countTaskInbox(): Promise<number> {
  const { supabase, workspaceId } = await getContext();
  const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "open").is("due_date", null).is("business_id", null);
  return count ?? 0;
}

/** Eventos (expandidos) y tareas con fecha dentro de un rango, para el calendario. */
export async function getCalendarItems(from: string, to: string): Promise<CalItem[]> {
  const { supabase, workspaceId } = await getContext();
  const { timezone } = await getContext();
  const [events, tasks, posts] = await Promise.all([
    // Los no recurrentes que tocan el rango y todos los recurrentes que ya empezaron.
    supabase.from("events").select("*").eq("workspace_id", workspaceId).lte("start_date", to).or(`end_date.gte.${from},recurrence.not.is.null`).limit(2000),
    supabase.from("tasks").select("id,title,due_date,due_time,business_id,priority,status").eq("workspace_id", workspaceId).gte("due_date", from).lte("due_date", to).limit(2000),
    // Calendario de contenido (Redes). Si la tabla aún no existe (vista previa sin migración), simplemente no salen.
    supabase.from("social_posts").select("id,title,caption,scheduled_at,status,business_id").eq("workspace_id", workspaceId).neq("status", "borrador")
      .gte("scheduled_at", new Date(Date.parse(`${from}T00:00:00Z`) - 86400_000).toISOString())
      .lte("scheduled_at", new Date(Date.parse(`${to}T23:59:59Z`) + 86400_000).toISOString()).limit(500),
  ]);
  if (events.error) fail("eventos", events.error);
  if (tasks.error) fail("tareas del calendario", tasks.error);
  const postItems = postsToItems(posts.data ?? [], timezone).filter((i) => i.date >= from && i.date <= to);
  return [...expandEvents(events.data, from, to), ...tasksToItems(tasks.data), ...postItems];
}

export async function getEvent(id: string): Promise<EventRow | null> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("events").select("*").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  if (error) fail("evento", error);
  return data;
}

// ------------------------------------------------------------------ objetivos
export type GoalView = Goal & { live: Live; milestones: Milestone[] };

async function liveFor(goals: Goal[]): Promise<Map<string, Live>> {
  const { supabase, workspaceId } = await getContext();
  const { date: today } = await getNow();
  const out = new Map<string, Live>(goals.map((g) => [g.id, {}]));
  if (goals.length === 0) return out;
  const ids = goals.map((g) => g.id);

  const [ms, tasks] = await Promise.all([
    supabase.from("goal_milestones").select("goal_id, done").eq("workspace_id", workspaceId).in("goal_id", ids),
    supabase.from("tasks").select("goal_id, status").eq("workspace_id", workspaceId).in("goal_id", ids),
  ]);
  if (ms.error) fail("hitos", ms.error);
  if (tasks.error) fail("tareas de objetivos", tasks.error);
  for (const m of ms.data) {
    const l = out.get(m.goal_id)!;
    l.milestonesTotal = (l.milestonesTotal ?? 0) + 1;
    l.milestonesDone = (l.milestonesDone ?? 0) + (m.done ? 1 : 0);
  }
  for (const t of tasks.data) {
    const l = out.get(t.goal_id!)!;
    l.tasksTotal = (l.tasksTotal ?? 0) + 1;
    l.tasksDone = (l.tasksDone ?? 0) + (t.status === "done" ? 1 : 0);
  }
  await Promise.all(
    goals.filter((g) => g.auto_source === "income" || g.auto_source === "profit").map(async (g) => {
      const from = g.period_start ?? g.created_at.slice(0, 10);
      const to = g.deadline ?? endOfMonth(today);
      const { data, error } = await supabase.rpc("stats_totals", { ws: workspaceId, p_from: from, p_to: to < from ? from : to, p_business: g.business_id ?? undefined });
      if (error) fail("métrica del objetivo", error);
      const income = data.reduce((s, r) => s + r.income_cents, 0);
      const expense = data.reduce((s, r) => s + r.expense_cents, 0);
      out.get(g.id)!.metricCents = g.auto_source === "income" ? income : income - expense;
    }),
  );
  return out;
}

export async function listGoals(opts: { status?: "active" | "done" | "all"; businessId?: string } = {}): Promise<GoalView[]> {
  const { supabase, workspaceId } = await getContext();
  let q = supabase.from("goals").select("*").eq("workspace_id", workspaceId).order("deadline", { ascending: true, nullsFirst: false }).order("created_at");
  if (opts.status === "active") q = q.eq("status", "active");
  else if (opts.status === "done") q = q.in("status", ["completed", "archived"]);
  if (opts.businessId) q = q.eq("business_id", opts.businessId);
  const { data, error } = await q.limit(500);
  if (error) fail("objetivos", error);
  const [live, ms] = await Promise.all([
    liveFor(data),
    data.length
      ? supabase.from("goal_milestones").select("*").eq("workspace_id", workspaceId).in("goal_id", data.map((g) => g.id)).order("sort_order").order("created_at")
      : Promise.resolve({ data: [] as Milestone[], error: null }),
  ]);
  if (ms.error) fail("hitos", ms.error);
  return data.map((g) => ({ ...g, live: live.get(g.id)!, milestones: ms.data.filter((m) => m.goal_id === g.id) }));
}

export async function getGoal(id: string): Promise<(GoalView & { history: GoalProgressRow[] }) | null> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("goals").select("*").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  if (error) fail("objetivo", error);
  if (!data) return null;
  const [live, ms, hist] = await Promise.all([
    liveFor([data]),
    supabase.from("goal_milestones").select("*").eq("workspace_id", workspaceId).eq("goal_id", id).order("sort_order").order("created_at"),
    supabase.from("goal_progress").select("*").eq("workspace_id", workspaceId).eq("goal_id", id).order("recorded_on", { ascending: true }).limit(500),
  ]);
  if (ms.error) fail("hitos", ms.error);
  if (hist.error) fail("histórico", hist.error);
  return { ...data, live: live.get(id)!, milestones: ms.data, history: hist.data };
}

export const goalLike = (g: Goal): GoalLike => ({
  measure_type: g.measure_type as GoalLike["measure_type"], target_value: g.target_value, current_value: g.current_value, auto_source: g.auto_source as GoalLike["auto_source"],
});

export { startOfMonth };

export type Reminder = Database["public"]["Tables"]["reminders"]["Row"];

/** Recordatorios sueltos pendientes (o pospuestos) de los próximos 30 días, y los que ya vencieron sin resolver. */
export async function listReminders(): Promise<Reminder[]> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("reminders").select("*").eq("workspace_id", workspaceId).in("status", ["pending", "snoozed", "sent"])
    .gte("remind_at", new Date(Date.now() - 3 * 86_400_000).toISOString()).lte("remind_at", new Date(Date.now() + 30 * 86_400_000).toISOString())
    .order("remind_at").limit(50);
  if (error) fail("recordatorios", error);
  // «sent» ya avisados siguen visibles 3 días por si no se resolvieron; los pendientes siempre.
  return data.filter((r) => r.status !== "sent" || Date.now() - Date.parse(r.sent_at ?? r.remind_at) < 3 * 86_400_000);
}

/** Tareas sin fecha pendientes, de mayor a menor prioridad (las más antiguas primero), con el total. */
export async function listNoDateTasks(limit: number, opts: { businessId?: string } = {}): Promise<{ tasks: { id: string; title: string; priority: number; business_id: string | null }[]; total: number }> {
  const { supabase, workspaceId } = await getContext();
  let q = supabase.from("tasks").select("id, title, priority, business_id", { count: "exact" }).eq("workspace_id", workspaceId).eq("status", "open").is("due_date", null);
  if (opts.businessId) q = q.eq("business_id", opts.businessId);
  const { data, count, error } = await q.order("priority", { ascending: false }).order("created_at", { ascending: true }).limit(limit);
  if (error) fail("tareas sin fecha", error);
  return { tasks: data, total: count ?? data.length };
}

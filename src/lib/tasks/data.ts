import "server-only";
import { getContext } from "@/lib/context";
import { addDays, endOfMonth, nowLocal, startOfMonth } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";
import { expandEvents, tasksToItems, type CalItem } from "./calendar";
import { type GoalLike, type Live } from "./goals";

export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskWithSubs = Task & { subtasks: Task[] };
export type EventRow = Database["public"]["Tables"]["events"]["Row"];
export type Goal = Database["public"]["Tables"]["goals"]["Row"];
export type Milestone = Database["public"]["Tables"]["goal_milestones"]["Row"];
export type GoalProgressRow = Database["public"]["Tables"]["goal_progress"]["Row"];

export type TaskView = "hoy" | "7dias" | "todas" | "negocio" | "hechas";
export const TASK_VIEWS: TaskView[] = ["hoy", "7dias", "todas", "negocio", "hechas"];

function fail(what: string, e: { message: string } | null): never {
  console.error(`[tasks] ${what}:`, e?.message);
  throw new Error(`No se pudo cargar: ${what}`);
}

export async function getNow() {
  const { timezone } = await getContext();
  return { timezone, ...nowLocal(new Date(), timezone) };
}

async function attachSubtasks(parents: Task[]): Promise<TaskWithSubs[]> {
  if (parents.length === 0) return [];
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("tasks").select("*").eq("workspace_id", workspaceId).in("parent_id", parents.map((p) => p.id)).order("sort_order").order("created_at");
  if (error) fail("subtareas", error);
  const by = new Map<string, Task[]>();
  for (const s of data) (by.get(s.parent_id!) ?? by.set(s.parent_id!, []).get(s.parent_id!)!).push(s);
  return parents.map((p) => ({ ...p, subtasks: by.get(p.id) ?? [] }));
}

const PRIORITY_THEN_TIME = (a: Task, b: Task) =>
  (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
  (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99") ||
  b.priority - a.priority ||
  a.created_at.localeCompare(b.created_at);

export async function listTasks(view: TaskView, opts: { businessId?: string; goalId?: string } = {}): Promise<TaskWithSubs[]> {
  const { supabase, workspaceId } = await getContext();
  const { date: today } = await getNow();
  let q = supabase.from("tasks").select("*").eq("workspace_id", workspaceId).is("parent_id", null);
  if (opts.businessId) q = q.eq("business_id", opts.businessId);
  if (opts.goalId) q = q.eq("goal_id", opts.goalId);

  switch (view) {
    case "hoy": q = q.eq("status", "open").lte("due_date", today); break;                       // atrasadas + hoy
    case "7dias": q = q.eq("status", "open").gte("due_date", today).lte("due_date", addDays(today, 6)); break;
    case "hechas": q = q.eq("status", "done").order("completed_at", { ascending: false }).limit(100); break;
    default: q = q.eq("status", "open");
  }
  const { data, error } = await q.limit(1000);
  if (error) fail("tareas", error);
  const rows = view === "hechas" ? data : [...data].sort(PRIORITY_THEN_TIME);
  return attachSubtasks(rows);
}

export async function getTask(id: string): Promise<TaskWithSubs | null> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("tasks").select("*").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  if (error) fail("tarea", error);
  return data ? (await attachSubtasks([data]))[0] : null;
}

export async function countOpenTasks() {
  const { supabase, workspaceId } = await getContext();
  const { date: today } = await getNow();
  const base = () => supabase.from("tasks").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "open").is("parent_id", null);
  const [overdue, dueToday] = await Promise.all([base().lt("due_date", today), base().eq("due_date", today)]);
  return { overdue: overdue.count ?? 0, today: dueToday.count ?? 0 };
}

/** Eventos (expandidos) y tareas con fecha dentro de un rango, para el calendario. */
export async function getCalendarItems(from: string, to: string): Promise<CalItem[]> {
  const { supabase, workspaceId } = await getContext();
  const [events, tasks] = await Promise.all([
    // Los no recurrentes que tocan el rango y todos los recurrentes que ya empezaron.
    supabase.from("events").select("*").eq("workspace_id", workspaceId).lte("start_date", to).or(`end_date.gte.${from},recurrence.not.is.null`).limit(2000),
    supabase.from("tasks").select("id,title,due_date,due_time,business_id,priority,status").eq("workspace_id", workspaceId).is("parent_id", null).gte("due_date", from).lte("due_date", to).limit(2000),
  ]);
  if (events.error) fail("eventos", events.error);
  if (tasks.error) fail("tareas del calendario", tasks.error);
  return [...expandEvents(events.data, from, to), ...tasksToItems(tasks.data)];
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
    supabase.from("tasks").select("goal_id, status").eq("workspace_id", workspaceId).is("parent_id", null).in("goal_id", ids),
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

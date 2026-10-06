import { TaskList } from "@/components/tasks/task-list";
import { getContext } from "@/lib/context";
import { addDays, nowLocal, startOfWeek, zonedToUtc } from "@/lib/dates";
import { getNow, listGoals, listTasks, type TaskView } from "@/lib/tasks/data";
import { groupTasks } from "@/lib/tasks/groups";
import { WidgetCard } from "../widget-card";
import { businessOf, type WidgetProps } from "../types";

/** Lista de tareas reutilizando la de la sección Tareas (se marcan desde aquí). */
async function TasksBlock({ w, ctx, view, title, href, onlyLate, businessId, empty }: WidgetProps & { view: TaskView; title: string; href: string; onlyLate?: boolean; businessId?: string; empty: string }) {
  const [tasks, goals] = await Promise.all([listTasks(view, { businessId }), listGoals({ status: "active" })]);
  const biz = new Map(ctx.businesses.map((b) => [b.id, b.name]));
  const max = w.size === "l" ? 12 : w.size === "s" ? 3 : 6;
  let groups = groupTasks(view, tasks, ctx.today, biz);
  if (onlyLate) groups = groups.filter((g) => g.key === "late");
  groups = groups.filter((g) => g.tasks.length > 0).map((g) => ({ ...g, tasks: g.tasks.slice(0, max) }));
  return (
    <WidgetCard title={title} href={href}>
      <TaskList groups={groups} businesses={ctx.businesses} goals={goals.map((g) => ({ id: g.id, title: g.title }))} today={ctx.today} emptyText={empty} defaultBusinessId={businessId} />
    </WidgetCard>
  );
}

export const TasksOverdueWidget = (p: WidgetProps) => <TasksBlock {...p} view="hoy" onlyLate title="Atrasadas" href="/tareas" empty="Nada atrasado. 👌" />;
export const TasksWeekWidget = (p: WidgetProps) => <TasksBlock {...p} view="7dias" title="Próximos 7 días" href="/tareas?v=7dias" empty="Semana despejada." />;

export function TasksBusinessWidget(p: WidgetProps) {
  const biz = businessOf(p.w, p.ctx);
  if (!biz) return <WidgetCard title="Tareas de un negocio"><p className="text-sm text-muted">Pulsa «Editar» → ajustes de este widget y elige el negocio.</p></WidgetCard>;
  return <TasksBlock {...p} view="todas" businessId={biz.id} title={`Tareas · ${biz.name}`} href={`/negocios/${biz.id}/tareas`} empty="Sin tareas abiertas." />;
}

const DAYS = ["L", "M", "X", "J", "V", "S", "D"];

/** Tareas completadas cada día de esta semana (lunes a domingo), en barras. */
export async function TasksDoneWeekWidget({ w, ctx }: WidgetProps) {
  const { supabase, workspaceId } = await getContext();
  const now = await getNow();
  const monday = startOfWeek(ctx.today);
  const { data, error } = await supabase.from("tasks").select("completed_at").eq("workspace_id", workspaceId).eq("status", "done")
    .gte("completed_at", zonedToUtc(monday, "00:00", now.timezone).toISOString()).limit(1000);
  if (error) throw new Error(error.message);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const counts = days.map((d) => (data ?? []).filter((t) => t.completed_at && nowLocal(new Date(t.completed_at), now.timezone).date === d).length);
  const total = counts.reduce((a, b) => a + b, 0), max = Math.max(1, ...counts);
  return (
    <WidgetCard title="Completadas esta semana" href="/tareas?v=hechas">
      <p className="text-[1.65rem] font-bold tabular-nums">{total}</p>
      <div className={`mt-auto flex items-end gap-1.5 pt-2 ${w.size === "s" ? "h-16" : "h-24"}`} role="img" aria-label={days.map((d, i) => `${DAYS[i]}: ${counts[i]}`).join(", ")}>
        {counts.map((c, i) => (
          <div key={days[i]} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div className={`w-full rounded-t-[4px] ${days[i] === ctx.today ? "bg-accent" : "bg-accent/45"}`} style={{ height: `${c ? Math.max(8, (c / max) * 100) : 3}%` }} title={`${c}`} />
            <span className={`text-[10px] ${days[i] === ctx.today ? "font-bold text-foreground" : "text-muted"}`}>{DAYS[i]}</span>
          </div>
        ))}
      </div>
    </WidgetCard>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { GoalActions } from "@/components/goals/goal-detail";
import { GoalFormButton } from "@/components/goals/goal-form";
import { ProgressBar } from "@/components/goals/progress-bar";
import { Sparkline } from "@/components/goals/sparkline";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskList } from "@/components/tasks/task-list";
import { listBusinesses } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { getGoal, getNow, goalLike, listTasks } from "@/lib/tasks/data";
import { groupTasks } from "@/lib/tasks/groups";
import { formatGoalValue, pace, progressPct } from "@/lib/tasks/goals";
import { snapshotGoal } from "../actions";

export const metadata = { title: "Objetivo" };

export default async function ObjetivoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const goal = await getGoal(id);
  if (!goal) notFound();
  const [now, tasks, businesses] = await Promise.all([getNow(), listTasks("todas", { goalId: id }), listBusinesses()]);
  const p = progressPct(goalLike(goal), goal.live);
  const auto = goal.auto_source !== null || goal.measure_type === "milestones";
  if (auto && goal.status === "active") await snapshotGoal(id, p.value); // deja constancia del valor automático
  const pc = pace(p.pct, goal.period_start ?? goal.created_at.slice(0, 10), goal.deadline, now.date);
  const bizOptions = businesses.map((b) => ({ id: b.id, name: b.name, color: b.color }));
  const biz = businesses.find((b) => b.id === goal.business_id);
  const fmt = (v: number) => formatGoalValue(goal.measure_type as never, v);
  const history = goal.history.map((h) => ({ date: h.recorded_on, value: h.value }));
  const sources: Record<string, string> = { income: "Ingresos del periodo", profit: "Beneficio del periodo", tasks: "Tareas vinculadas completadas" };

  return (
    <>
      <Link href="/objetivos" className="mb-3 inline-block text-sm text-muted hover:text-foreground">← Objetivos</Link>
      <header className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{goal.title}</h1>
          {goal.description && <p className="mt-1 text-sm text-muted">{goal.description}</p>}
          <p className="mt-1 text-xs text-muted">{[biz?.name, goal.deadline && `hasta ${formatDate(goal.deadline)}`, goal.auto_source && `se actualiza solo: ${sources[goal.auto_source]}`].filter(Boolean).join(" · ")}</p>
        </div>
        <GoalFormButton goal={goal} businesses={businesses.map((b) => ({ id: b.id, name: b.name }))} />
      </header>

      <section className="mb-5 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between"><span className="text-3xl font-semibold tabular-nums">{Math.round(p.pct)} %</span>
          <span className="text-sm text-muted tabular-nums">{goal.measure_type === "milestones" ? `${goal.live.milestonesDone ?? 0} de ${goal.live.milestonesTotal ?? 0} hitos` : `${fmt(p.value)} de ${fmt(p.target)}`}</span></div>
        <ProgressBar pct={p.pct} className="mt-3 h-3" color={p.reached ? "#16a34a" : undefined} />
        {pc && <p className="mt-2 text-xs text-muted">{{ ahead: "Vas por delante del tiempo previsto.", ontrack: "Vas en ritmo.", behind: "Vas con retraso respecto al tiempo transcurrido." }[pc]}</p>}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <GoalActions goal={goal} canEditValue={goal.measure_type !== "milestones" && !goal.auto_source} />
          <section className="rounded-xl border border-border bg-surface p-4"><h2 className="mb-2 text-sm font-semibold">Histórico</h2><Sparkline points={history} format={fmt} /></section>
        </div>
        <section>
          <h2 className="mb-2 text-sm font-semibold">Tareas vinculadas</h2>
          <div className="mb-3"><QuickAdd today={now.date} nowTime={now.time} goalId={id} businessId={goal.business_id ?? undefined} placeholder="Nueva tarea para este objetivo…" /></div>
          <TaskList groups={groupTasks("todas", tasks, now.date, new Map())} businesses={bizOptions} goals={[{ id, title: goal.title }]} today={now.date} emptyText="Sin tareas vinculadas. Las que añadas aquí cuentan para el progreso si eliges «Tareas vinculadas»." />
        </section>
      </div>
    </>
  );
}

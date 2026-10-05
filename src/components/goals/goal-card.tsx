import Link from "next/link";
import { CalendarClock } from "lucide-react";
import type { GoalView } from "@/lib/tasks/data";
import { goalLike } from "@/lib/tasks/data";
import { formatDate } from "@/lib/dates";
import { formatGoalValue, pace, progressPct } from "@/lib/tasks/goals";
import { ProgressBar } from "./progress-bar";

const PACE_TEXT = { ahead: ["Va por delante", "text-emerald-600 dark:text-emerald-400"], ontrack: ["En ritmo", "text-muted"], behind: ["Va con retraso", "text-danger"] } as const;

export function GoalCard({ goal, today, businessName, businessColor }: { goal: GoalView; today: string; businessName?: string; businessColor?: string }) {
  const p = progressPct(goalLike(goal), goal.live);
  const pc = pace(p.pct, goal.period_start ?? goal.created_at.slice(0, 10), goal.deadline, today);
  const overdue = goal.deadline && goal.deadline < today && !p.reached && goal.status === "active";
  return (
    <Link href={`/objetivos/${goal.id}`} className="block rounded-xl border border-border bg-surface p-4 hover:bg-surface-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="truncate font-semibold">{goal.title}</p>
          {businessName && <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted"><span className="size-2 rounded-full" style={{ backgroundColor: businessColor }} aria-hidden />{businessName}</p>}
        </div>
        <span className="shrink-0 text-lg font-semibold tabular-nums">{Math.round(p.pct)} %</span>
      </div>
      <ProgressBar pct={p.pct} className="mt-3" label={`Progreso de ${goal.title}`} color={p.reached ? "#16a34a" : undefined} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 text-xs text-muted">
        <span className="tabular-nums">{goal.measure_type === "milestones" ? `${goal.live.milestonesDone ?? 0} de ${goal.live.milestonesTotal ?? 0} hitos` : `${formatGoalValue(goal.measure_type as never, p.value)} de ${formatGoalValue(goal.measure_type as never, p.target)}`}</span>
        <span className="flex items-center gap-2">
          {goal.status !== "active" && <span className="font-medium">{goal.status === "completed" ? "Cumplido" : "Archivado"}</span>}
          {goal.status === "active" && pc && <span className={PACE_TEXT[pc][1]}>{PACE_TEXT[pc][0]}</span>}
          {goal.deadline && <span className={overdue ? "inline-flex items-center gap-1 font-medium text-danger" : "inline-flex items-center gap-1"}><CalendarClock className="size-3.5" aria-hidden />{formatDate(goal.deadline)}</span>}
        </span>
      </div>
    </Link>
  );
}

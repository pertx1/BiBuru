import Link from "next/link";
import { Sparkline } from "@/components/goals/sparkline";
import { diffDays, formatDate } from "@/lib/dates";
import { formatGoalValue, progressPct } from "@/lib/tasks/goals";
import { getGoal, goalLike, listGoals, type GoalView } from "@/lib/tasks/data";
import { WidgetCard } from "../widget-card";
import type { WidgetProps } from "../types";

const valueText = (g: GoalView, v: number) => g.measure_type === "milestones" ? `${g.live.milestonesDone ?? 0} de ${g.live.milestonesTotal ?? 0} hitos` : formatGoalValue(g.measure_type as never, v);

function Ring({ pct, color, size = 88 }: { pct: number; color: string; size?: number }) {
  const r = 15.5, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct));
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} role="img" aria-label={`${Math.round(p)} %`} className="shrink-0">
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="3.5" />
      <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(p / 100) * c} ${c}`} transform="rotate(-90 18 18)" />
      <text x="18" y="20.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--foreground)">{Math.round(p)}%</text>
    </svg>
  );
}

function GoalRingCard({ title, g, ctx, extra, compact }: { title: string; g: GoalView | undefined; ctx: WidgetProps["ctx"]; extra?: string; compact: boolean }) {
  if (!g) return <WidgetCard title={title} href="/objetivos"><p className="text-sm text-muted">No hay objetivos activos que mostrar.</p></WidgetCard>;
  const p = progressPct(goalLike(g), g.live);
  const color = ctx.businesses.find((b) => b.id === g.business_id)?.color ?? "var(--accent)";
  return (
    <WidgetCard title={title} href={`/objetivos/${g.id}`}>
      <Link href={`/objetivos/${g.id}`} className={compact ? "flex flex-col items-start gap-2" : "flex items-center gap-3"}>
        <Ring pct={p.pct} color={color} size={compact ? 64 : 88} />
        <span className="min-w-0">
          <span className="line-clamp-2 font-semibold leading-snug">{g.title}</span>
          <span className="block text-xs tabular-nums text-muted">{valueText(g, p.value)}{g.measure_type !== "milestones" && ` de ${valueText(g, p.target)}`}</span>
          {extra && <span className="mt-0.5 block text-xs font-semibold text-accent">{extra}</span>}
        </span>
      </Link>
    </WidgetCard>
  );
}

/** Anillo de un objetivo elegido (o el más avanzado sin cumplir). */
export async function GoalRingWidget({ w, ctx }: WidgetProps) {
  const goals = await listGoals({ status: "active" });
  const g = goals.find((x) => x.id === w.settings.goal)
    ?? [...goals].sort((a, b) => progressPct(goalLike(b), b.live).pct - progressPct(goalLike(a), a.live).pct).find((x) => !progressPct(goalLike(x), x.live).reached) ?? goals[0];
  return <GoalRingCard title="Progreso" g={g} ctx={ctx} compact={w.size === "s"} />;
}

/** El objetivo activo con la fecha límite más cercana (los vencidos primero). */
export async function GoalDeadlineWidget({ w, ctx }: WidgetProps) {
  const g = (await listGoals({ status: "active" })).filter((x) => x.deadline && !progressPct(goalLike(x), x.live).reached).sort((a, b) => a.deadline!.localeCompare(b.deadline!))[0];
  const left = g?.deadline ? diffDays(ctx.today, g.deadline) : null;
  const extra = left == null ? undefined : left < 0 ? `Venció hace ${-left} ${left === -1 ? "día" : "días"}` : left === 0 ? "Vence hoy" : `Quedan ${left} ${left === 1 ? "día" : "días"} · ${formatDate(g!.deadline!)}`;
  return <GoalRingCard title="Objetivo más urgente" g={g} ctx={ctx} extra={extra} compact={w.size === "s"} />;
}

/** Histórico de un objetivo (un punto por día con cambios). */
export async function GoalTrendWidget({ w }: WidgetProps) {
  const goals = await listGoals({ status: "active" });
  const id = goals.find((x) => x.id === w.settings.goal)?.id ?? goals[0]?.id;
  const g = id ? await getGoal(id) : null;
  if (!g) return <WidgetCard title="Evolución" href="/objetivos"><p className="text-sm text-muted">No hay objetivos activos.</p></WidgetCard>;
  return (
    <WidgetCard title={`Evolución · ${g.title}`} href={`/objetivos/${g.id}`}>
      <Sparkline points={g.history.map((h) => ({ date: h.recorded_on, value: Number(h.value) }))} format={(v) => valueText(g, v)} />
    </WidgetCard>
  );
}

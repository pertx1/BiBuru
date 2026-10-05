/** Cálculo y formato del progreso de objetivos (lógica pura). Valores en punto fijo ×100. */

export type GoalMeasure = "number" | "euros" | "percent" | "milestones";
export type GoalAuto = "income" | "profit" | "tasks" | null;

export type GoalLike = {
  measure_type: GoalMeasure;
  target_value: number;
  current_value: number;
  auto_source: GoalAuto;
};

export type Live = {
  /** Valor automático (ingresos/beneficio del periodo, en céntimos) */
  metricCents?: number;
  tasksDone?: number;
  tasksTotal?: number;
  milestonesDone?: number;
  milestonesTotal?: number;
};

/** Valor actual efectivo ×100 (el automático si lo hay, si no el guardado). */
export function effectiveValue(g: GoalLike, live: Live): number {
  if (g.measure_type === "milestones") {
    return live.milestonesTotal ? Math.round((live.milestonesDone ?? 0) * 10000 / live.milestonesTotal) : 0; // % ×100
  }
  if (g.auto_source === "tasks") {
    const pct = live.tasksTotal ? (live.tasksDone ?? 0) / live.tasksTotal : 0;
    // Con objetivo en número/euros/porcentaje, el % de tareas se aplica sobre el objetivo.
    return Math.round(pct * (g.measure_type === "percent" ? 10000 : g.target_value || 10000));
  }
  if ((g.auto_source === "income" || g.auto_source === "profit") && live.metricCents !== undefined) return live.metricCents;
  return g.current_value;
}

/** Porcentaje 0..100 (acotado) y si se ha alcanzado. */
export function progressPct(g: GoalLike, live: Live): { pct: number; reached: boolean; value: number; target: number } {
  const value = effectiveValue(g, live);
  const target = g.measure_type === "milestones" || g.measure_type === "percent" ? 10000 : g.target_value;
  if (target <= 0) return { pct: 0, reached: false, value, target };
  const raw = (value / target) * 100;
  return { pct: Math.max(0, Math.min(100, Math.round(raw * 10) / 10)), reached: value >= target, value, target };
}

const nf = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export function formatGoalValue(measure: GoalMeasure, v: number): string {
  switch (measure) {
    case "euros": return eur.format(v / 100);
    case "percent": case "milestones": return `${nf.format(v / 100)} %`;
    default: return nf.format(v / 100);
  }
}

/** Texto de un formulario ("1.500,5") a punto fijo ×100, o null. Reutiliza el parser de importes. */
export { toCents as parseFixed } from "@/lib/money";

/**
 * ¿Va a buen ritmo? Compara el avance con el tiempo transcurrido entre inicio y fecha límite.
 */
export function pace(pct: number, start: string | null, deadline: string | null, today: string): "ahead" | "ontrack" | "behind" | null {
  if (!start || !deadline || deadline <= start || pct >= 100) return null;
  const total = (Date.parse(deadline) - Date.parse(start)) / 86_400_000;
  const elapsed = Math.max(0, Math.min(total, (Date.parse(today) - Date.parse(start)) / 86_400_000));
  const expected = (elapsed / total) * 100;
  if (pct >= expected + 10) return "ahead";
  if (pct >= expected - 10) return "ontrack";
  return "behind";
}

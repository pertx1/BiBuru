/** Cálculos puros del Resumen financiero (probados en tests): mismas fuentes que Estadísticas. */
export type Totals = { income: number; expense: number; profit: number; orders: number };
export type MonthRow = { month: string; income: number; expense: number; profit: number };

const empty = (): Totals => ({ income: 0, expense: 0, profit: 0, orders: 0 });

/** Suma los totales por negocio (resultado de `stats_totals`) de todos o de uno. */
export function pickTotals(byBusiness: Map<string, Totals>, businessId?: string): Totals {
  const t = empty();
  for (const [id, v] of byBusiness) {
    if (businessId && id !== businessId) continue;
    t.income += v.income; t.expense += v.expense; t.profit += v.profit; t.orders += v.orders;
  }
  return t;
}

/** Abreviatura para el eje Y: 450 · 900 · 1,4K · 1,8K · 2,5M (los valores llegan en euros). */
export function shortEuros(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("es-ES", { maximumFractionDigits: 1 })}M`;
  if (a >= 1000) return `${(v / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })}K`;
  return Math.round(v).toLocaleString("es-ES");
}

/** Primer día del mes de inicio para un gráfico de `months` meses que termina en el mes de `today`. */
export function chartStart(today: string, months: number): string {
  const y = +today.slice(0, 4), m = +today.slice(5, 7) - 1 - (months - 1);
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
}

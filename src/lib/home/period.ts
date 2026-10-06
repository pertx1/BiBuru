import { addDays, addMonths, diffDays, endOfMonth, startOfMonth, type Period } from "@/lib/dates";
import type { HomePeriodKey } from "./layout";

export type HomeRange = { current: Period; previous: Period; granularity: "day" | "month" };

/**
 * Rango del selector de Inicio y su periodo de comparación («hasta hoy», como Shopify):
 * este mes = del día 1 a hoy frente al mismo tramo del mes anterior; este año = 1 de enero a hoy frente al mismo tramo del año pasado.
 */
export function homeRange(key: HomePeriodKey, today: string): HomeRange {
  switch (key) {
    case "hoy":
      return { current: { from: today, to: today }, previous: { from: addDays(today, -1), to: addDays(today, -1) }, granularity: "day" };
    case "7d":
    case "30d": {
      const n = key === "7d" ? 7 : 30;
      return { current: { from: addDays(today, -(n - 1)), to: today }, previous: { from: addDays(today, -(2 * n - 1)), to: addDays(today, -n) }, granularity: "day" };
    }
    case "mes": {
      const from = startOfMonth(today);
      const prevFrom = addMonths(from, -1);
      const prevTo = [addDays(prevFrom, diffDays(from, today)), endOfMonth(prevFrom)].sort()[0];
      return { current: { from, to: today }, previous: { from: prevFrom, to: prevTo }, granularity: "day" };
    }
    case "ano": {
      const y = +today.slice(0, 4);
      const lastYearSameDay = `${y - 1}${today.slice(4)}` === `${y - 1}-02-29` ? `${y - 1}-02-28` : `${y - 1}${today.slice(4)}`;
      return { current: { from: `${y}-01-01`, to: today }, previous: { from: `${y - 1}-01-01`, to: lastYearSameDay }, granularity: "month" };
    }
  }
}

export type SeriesPoint = { key: string; income: number; expense: number };
export type ComparePoint = { label: string; date: string; prevDate: string | null; current: number; previous: number | null };

/**
 * Empareja el periodo actual con el anterior punto a punto (día 1 con día 1…) para dibujar las dos líneas.
 * `pick` elige la métrica (ventas, beneficio…). Si el anterior es más corto, sus puntos sobrantes quedan en null.
 */
export function pairSeries(cur: SeriesPoint[], prev: SeriesPoint[], pick: (p: SeriesPoint) => number): ComparePoint[] {
  return cur.map((c, i) => ({ label: c.key, date: c.key, prevDate: prev[i]?.key ?? null, current: pick(c), previous: prev[i] ? pick(prev[i]) : null }));
}

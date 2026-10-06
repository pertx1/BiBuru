import "server-only";
import { getContext } from "@/lib/context";
import { getMonthlySeries, getTotalsByBusiness } from "@/lib/data";
import { endOfMonth, startOfMonth, type Period } from "@/lib/dates";
import { chartStart, pickTotals } from "./finance";
import type { HomeRange, SeriesPoint } from "./period";

/** Serie diaria de ingresos y gastos (céntimos), un punto por día aunque no haya movimientos. */
export async function getDailySeries(period: Period, businessId?: string): Promise<SeriesPoint[]> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.rpc("stats_daily", { ws: workspaceId, p_from: period.from, p_to: period.to, p_business: businessId });
  if (error) throw new Error(`serie diaria: ${error.message}`);
  return data.map((r) => ({ key: r.day, income: Number(r.income_cents), expense: Number(r.expense_cents) }));
}

/** Serie del periodo de Inicio (por días o por meses) y la del periodo anterior. */
export async function getRangeSeries(range: HomeRange, businessId?: string) {
  const load = async (p: Period) => range.granularity === "day"
    ? getDailySeries(p, businessId)
    : (await getMonthlySeries(p, businessId)).map((m) => ({ key: m.month, income: m.income, expense: m.expense }));
  const [cur, prev] = await Promise.all([load(range.current), load(range.previous)]);
  return { cur, prev };
}

/** Totales del periodo de Inicio y del anterior (las mismas funciones SQL que Estadísticas). */
export async function getRangeTotals(range: HomeRange, businessId?: string) {
  const [cur, prev] = await Promise.all([getTotalsByBusiness(range.current), getTotalsByBusiness(range.previous)]);
  return { current: pickTotals(cur, businessId), previous: pickTotals(prev, businessId) };
}

const ALL_TIME: Period = { from: "1900-01-01", to: "2999-12-31" };

/** Resumen financiero: totales de siempre, los del mes en curso y la serie de los últimos `months` meses. */
export async function getFinanceSummary(today: string, months: number, businessId?: string) {
  const [all, month, series] = await Promise.all([
    getTotalsByBusiness(ALL_TIME),
    getTotalsByBusiness({ from: startOfMonth(today), to: endOfMonth(today) }),
    getMonthlySeries({ from: chartStart(today, months), to: endOfMonth(today) }, businessId),
  ]);
  return { total: pickTotals(all, businessId), month: pickTotals(month, businessId), series };
}

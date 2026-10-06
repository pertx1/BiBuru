import Link from "next/link";
import { getRangeSeries, getRangeTotals } from "@/lib/home/data";
import { pairSeries } from "@/lib/home/period";
import { formatEUR, marginPct } from "@/lib/money";
import { KpiChartLazy } from "../charts/lazy";
import { Delta } from "../widget-card";
import { businessOf, type WidgetProps } from "../types";

const PERIOD_TEXT = { hoy: "hoy", "7d": "últimos 7 días", "30d": "últimos 30 días", mes: "este mes", ano: "este año" } as const;

/** Tarjeta de analítica estilo Shopify: título, cifra grande, % frente al anterior y línea actual vs. discontinua anterior. */
async function KpiWidget({ w, ctx, metric }: WidgetProps & { metric: "sales" | "profit" }) {
  const biz = businessOf(w, ctx);
  const [{ current, previous }, { cur, prev }] = await Promise.all([getRangeTotals(ctx.range, biz?.id), getRangeSeries(ctx.range, biz?.id)]);
  const pick = metric === "sales" ? (p: { income: number }) => p.income : (p: { income: number; expense: number }) => p.income - p.expense;
  const value = metric === "sales" ? current.income : current.profit;
  const before = metric === "sales" ? previous.income : previous.profit;
  const points = pairSeries(cur, prev, pick);
  const color = biz?.color ?? "var(--accent)";
  const title = metric === "sales" ? "Ventas" : "Beneficio";
  const margin = metric === "profit" ? marginPct(current.profit, current.income) : null;
  const compact = w.size === "s";
  return (
    <section className="flex h-full min-w-0 flex-col rounded-xl border border-border bg-surface p-4">
      <Link href={biz ? `/negocios/${biz.id}` : "/negocios"} className="block" aria-label={`${title}: abrir estadísticas`}>
        <h2 className="flex items-center gap-1.5 truncate text-[13px] font-medium text-muted">
          {biz && <span className="size-2 shrink-0 rounded-full" style={{ background: biz.color }} aria-hidden />}
          {title}{biz ? ` · ${biz.name}` : ""}
        </h2>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <p className={`font-bold tabular-nums tracking-tight ${compact ? "text-xl" : "text-[1.65rem]"}`}>{formatEUR(value)}</p>
          {ctx.compare && <Delta current={value} previous={before} />}
        </div>
        <p className="text-xs text-muted">
          {PERIOD_TEXT[ctx.periodKey]}{margin != null && ` · margen ${margin.toLocaleString("es-ES")} %`}
        </p>
      </Link>
      {points.length > 1 && (
        <div className="mt-auto pt-2">
          <KpiChartLazy points={points} color={color} granularity={ctx.range.granularity} compare={ctx.compare} compact={compact} label={`${title} por ${ctx.range.granularity === "day" ? "día" : "mes"}`} />
        </div>
      )}
    </section>
  );
}

export const SalesWidget = (p: WidgetProps) => <KpiWidget {...p} metric="sales" />;
export const ProfitWidget = (p: WidgetProps) => <KpiWidget {...p} metric="profit" />;

import { plural } from "@/lib/utils";
import { BarList } from "@/components/ui/bar-list";
import { Stat } from "@/components/ui/stat";
import {
  getExpensesByCategory, getMonthlySeries, getTopProducts, getTotalsWithPrevious,
} from "@/lib/data";
import { PERIOD_LABELS, formatDate, previousPeriod, type Period, type PeriodPreset } from "@/lib/dates";
import { formatEUR, marginPct, variationPct } from "@/lib/money";
import { MonthlyChartLazy } from "./monthly-chart-lazy";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** Cifras, comparación con el periodo anterior y rankings de un negocio (o de todos). */
export async function StatsPanel({ period, preset, businessId }: { period: Period; preset: PeriodPreset; businessId?: string }) {
  const [totals, monthly, products, sizes, colors, categories] = await Promise.all([
    getTotalsWithPrevious(period, businessId),
    getMonthlySeries(period, businessId),
    getTopProducts(period, "product", businessId),
    getTopProducts(period, "size", businessId),
    getTopProducts(period, "color", businessId),
    getExpensesByCategory(period, businessId),
  ]);
  const { current: c, previous: p } = totals;
  const prev = previousPeriod(period);
  const margin = marginPct(c.profit, c.income);
  const prevMargin = marginPct(p.profit, p.income);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        {PERIOD_LABELS[preset]}: {formatDate(period.from)} – {formatDate(period.to)} · comparado con {formatDate(prev.from)} – {formatDate(prev.to)}
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Ingresos" value={formatEUR(c.income)} variation={variationPct(c.income, p.income)} sub={plural(c.orders, "pedido", "pedidos")} />
        <Stat label="Gastos" value={formatEUR(c.expense)} variation={variationPct(c.expense, p.expense)} goodWhenUp={false} />
        <Stat label="Beneficio" value={formatEUR(c.profit)} variation={variationPct(c.profit, p.profit)} />
        <Stat
          label="Margen" value={margin === null ? "—" : `${margin.toLocaleString("es-ES")} %`}
          sub={prevMargin === null ? undefined : `antes ${prevMargin.toLocaleString("es-ES")} %`}
        />
      </div>
      <Card title="Por mes"><MonthlyChartLazy data={monthly} /></Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Productos más vendidos (unidades)">
          <BarList rows={products.map((r) => ({ label: r.label, value: r.units, sub: formatEUR(r.revenue) }))} format={(v) => `${v} uds`} />
        </Card>
        <Card title="Gastos por categoría">
          <BarList rows={categories.map((r) => ({ label: r.label, value: r.amount, color: r.color }))} format={formatEUR} />
        </Card>
        <Card title="Producto y talla">
          <BarList rows={sizes.map((r) => ({ label: r.label, value: r.units }))} format={(v) => `${v} uds`} />
        </Card>
        <Card title="Colores">
          <BarList rows={colors.map((r) => ({ label: r.label, value: r.units }))} format={(v) => `${v} uds`} />
        </Card>
      </div>
    </div>
  );
}

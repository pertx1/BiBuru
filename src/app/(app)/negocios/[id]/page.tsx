import { plural } from "@/lib/utils";
import Link from "next/link";
import { MonthlyChartLazy } from "@/components/businesses/monthly-chart-lazy";
import { ArchiveButton } from "@/components/businesses/archive-button";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { getBusiness, getMonthlySeries, getTotalsWithPrevious, listExpenses, listOrders } from "@/lib/data";
import { addMonths, formatDate, startOfMonth, endOfMonth, todayISO } from "@/lib/dates";
import { formatEUR, marginPct, variationPct } from "@/lib/money";
import { ORDER_STATUS_COLOR, ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/schemas";

export const metadata = { title: "Resumen del negocio" };

export default async function ResumenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const today = todayISO();
  const month = { from: startOfMonth(today), to: endOfMonth(today) };
  const sixMonths = { from: startOfMonth(addMonths(today, -5)), to: endOfMonth(today) };
  const [business, totals, series, orders, expenses] = await Promise.all([
    getBusiness(id),
    getTotalsWithPrevious(month, id),
    getMonthlySeries(sixMonths, id),
    listOrders(id, { limit: 5 }),
    listExpenses(id, { limit: 5 }),
  ]);
  const { current: c, previous: p } = totals;
  const margin = marginPct(c.profit, c.income);
  const pending = orders.filter((o) => o.status === "sin_hacer" || o.status === "en_casa" || o.status === "en_paquete").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Ingresos del mes" value={formatEUR(c.income)} variation={variationPct(c.income, p.income)} sub={plural(c.orders, "pedido", "pedidos")} />
        <Stat label="Gastos del mes" value={formatEUR(c.expense)} variation={variationPct(c.expense, p.expense)} goodWhenUp={false} />
        <Stat label="Beneficio del mes" value={formatEUR(c.profit)} variation={variationPct(c.profit, p.profit)} />
        <Stat label="Margen" value={margin === null ? "—" : `${margin.toLocaleString("es-ES")} %`} sub={pending > 0 ? `${plural(pending, "pedido", "pedidos")} por enviar` : undefined} />
      </div>
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Últimos 6 meses</h2>
        <MonthlyChartLazy data={series} />
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Últimos pedidos</h2><Link href={`/negocios/${id}/pedidos`} className="inline-flex min-h-11 items-center text-xs text-accent">Ver todos</Link></div>
          {orders.length === 0 ? <p className="text-sm text-muted">Aún no hay pedidos.</p> : (
            <ul className="divide-y divide-border">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{formatDate(o.order_date)} · {o.customer ?? o.order_number ?? o.order_items[0]?.product_name}</span>
                  <span className="flex shrink-0 items-center gap-2"><Badge color={ORDER_STATUS_COLOR[o.status as OrderStatus]}>{ORDER_STATUS_LABEL[o.status as OrderStatus]}</Badge><span className="tabular-nums">{formatEUR(o.total_cents)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Últimos gastos</h2><Link href={`/negocios/${id}/gastos`} className="inline-flex min-h-11 items-center text-xs text-accent">Ver todos</Link></div>
          {expenses.length === 0 ? <p className="text-sm text-muted">Aún no hay gastos.</p> : (
            <ul className="divide-y divide-border">
              {expenses.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{formatDate(e.expense_date)} · {e.concept ?? e.expense_categories?.name ?? "Gasto"}</span>
                  <span className="shrink-0 tabular-nums">{formatEUR(e.amount_cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <div className="flex justify-end">{business && <ArchiveButton id={business.id} archived={business.archived} />}</div>
    </div>
  );
}

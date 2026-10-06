import Link from "next/link";
import { Download } from "lucide-react";
import { DebtsView, OwedSummary, UnreviewedBanner } from "@/components/orders/debts";
import { OrderFilters } from "@/components/orders/order-filters";
import { OrdersView } from "@/components/orders/orders-view";
import { getOrder, listProducts, PAGE_SIZE } from "@/lib/data";
import { addMonths, startOfMonth, todayISO } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { countUnreviewed, filteredOrderAmounts, getCollections, getOrderWithPayments, listDueOrders, listOrdersFiltered, orderFacets, type OrderWithPayments } from "@/lib/orders/data";
import { debtors, filteredTotals, hasFilters, parseOrderFilters, receivables } from "@/lib/orders/payments";
import { ORDER_STATUSES } from "@/lib/schemas";

export const metadata = { title: "Pedidos" };

type SP = Record<string, string | undefined>;
const UUID = /^[0-9a-f-]{36}$/i;

/** Las partes de cobros no deben tumbar la lista (p. ej. una vista previa con la base aún sin la migración de cobros). */
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch (e) { console.error("[pedidos]", e instanceof Error ? e.message : e); return fallback; }
}

export default async function PedidosPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const today = todayISO();
  const limit = Math.min(Math.max(parseInt(sp.limite ?? "", 10) || PAGE_SIZE, PAGE_SIZE), 2000);
  const filters = parseOrderFilters(sp, today, ORDER_STATUSES);
  const debtsView = sp.vista === "deudas";
  const openId = sp.abrir && UUID.test(sp.abrir) ? sp.abrir : null;

  const [orders, products, openOrder, due, unreviewed, facets, amounts, collections] = await Promise.all([
    listOrdersFiltered(id, filters, limit),
    listProducts(id),
    openId ? safe<OrderWithPayments | null>(getOrderWithPayments(id, openId), null).then(async (o) => o ?? (await getOrder(id, openId)) as OrderWithPayments | null) : Promise.resolve(null),
    safe(listDueOrders(id), []),
    safe(countUnreviewed(id), 0),
    orderFacets(id),
    hasFilters(filters) ? safe(filteredOrderAmounts(id, filters), null) : Promise.resolve(null),
    debtsView ? safe(getCollections(startOfMonth(addMonths(today, -11)), today, id), []) : Promise.resolve([]),
  ]);
  const owed = receivables(due, today);
  const totals = amounts ? filteredTotals(amounts.map((r) => ({ ...r, paid_cents: Number(r.paid_cents), due_cents: Number(r.due_cents ?? 0) }))) : null;

  const keep = (extra: SP) => {
    const all: SP = { ...sp, abrir: undefined, nuevo: undefined, ...extra };
    const out = new URLSearchParams();
    for (const [k, v] of Object.entries(all)) if (v) out.set(k, v);
    return out.toString();
  };
  const more = keep({ limite: String(limit + PAGE_SIZE) });

  return (
    <div className="flex flex-col gap-4 pb-20 md:pb-0">
      <OwedSummary totalCents={owed.totalCents} count={owed.count} oldestDays={owed.oldestDays} href={debtsView ? `?${keep({ vista: undefined })}` : `?${keep({ vista: "deudas" })}`} active={debtsView} />
      {unreviewed > 0 && <UnreviewedBanner businessId={id} count={unreviewed} />}

      {debtsView ? (
        <DebtsView businessId={id} debtors={debtors(due, today)} aging={owed.aging} collections={collections} />
      ) : (
        <>
          <OrderFilters businessId={id} customers={facets.customers} channels={facets.channels} products={products.map((p) => p.name)} />
          {totals && (
            <dl className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface p-3 text-sm md:grid-cols-5">
              <div><dt className="text-xs text-muted">Pedidos</dt><dd className="font-semibold tabular-nums">{totals.count}</dd></div>
              <div><dt className="text-xs text-muted">Importe</dt><dd className="font-semibold tabular-nums">{formatEUR(totals.totalCents)}</dd></div>
              <div><dt className="text-xs text-muted">Cobrado</dt><dd className="font-semibold tabular-nums text-income">{formatEUR(totals.paidCents)}</dd></div>
              <div><dt className="text-xs text-muted">Pendiente</dt><dd className="font-semibold tabular-nums text-bad">{formatEUR(totals.dueCents)}</dd></div>
              <div><dt className="text-xs text-muted">Beneficio</dt><dd className={`font-semibold tabular-nums ${totals.profitCents >= 0 ? "text-good" : "text-bad"}`}>{formatEUR(totals.profitCents)}</dd></div>
            </dl>
          )}
        </>
      )}

      <OrdersView businessId={id} orders={debtsView ? [] : orders} products={products} today={today} openOrder={openOrder} highlightId={sp.nuevo && UUID.test(sp.nuevo) ? sp.nuevo : null} hideList={debtsView} />
      {!debtsView && (
        <div className="flex items-center justify-between text-sm">
          {orders.length >= limit ? <Link href={`?${more}`} scroll={false} className="text-accent">Ver más pedidos</Link> : <span className="text-muted">{orders.length} pedidos</span>}
          <a href={`/api/export/pedidos?negocio=${id}`} className="inline-flex min-h-11 md:min-h-10 items-center gap-1.5 text-muted hover:text-foreground"><Download className="size-4" aria-hidden /> Exportar CSV</a>
        </div>
      )}
    </div>
  );
}

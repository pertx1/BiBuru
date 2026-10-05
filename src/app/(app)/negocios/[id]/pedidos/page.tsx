import Link from "next/link";
import { Download } from "lucide-react";
import { OrdersView } from "@/components/orders/orders-view";
import { getOrder, listOrders, listProducts, PAGE_SIZE } from "@/lib/data";
import { isValidISO, todayISO } from "@/lib/dates";
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from "@/lib/schemas";

export const metadata = { title: "Pedidos" };

type SP = { estado?: string; desde?: string; hasta?: string; q?: string; limite?: string; abrir?: string };

export default async function PedidosPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const limit = Math.min(Math.max(parseInt(sp.limite ?? "", 10) || PAGE_SIZE, PAGE_SIZE), 2000);
  const status = ORDER_STATUSES.find((s) => s === sp.estado);
  const from = sp.desde && isValidISO(sp.desde) ? sp.desde : undefined;
  const to = sp.hasta && isValidISO(sp.hasta) ? sp.hasta : undefined;
  const [orders, products, openOrder] = await Promise.all([listOrders(id, { status, from, to, q: sp.q, limit }), listProducts(id), sp.abrir && /^[0-9a-f-]{36}$/i.test(sp.abrir) ? getOrder(id, sp.abrir) : Promise.resolve(null)]);

  const more = new URLSearchParams(Object.entries({ ...sp, limite: String(limit + PAGE_SIZE) }).filter(([, v]) => v) as [string, string][]);
  return (
    <div className="flex flex-col gap-4">
      <form method="get" className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <input name="q" defaultValue={sp.q} placeholder="Buscar cliente o nº" aria-label="Buscar" className="col-span-2 min-h-11 rounded-lg border border-border bg-surface px-3 text-base md:min-h-9 md:text-sm" />
        <select name="estado" defaultValue={status ?? ""} aria-label="Estado" className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base md:min-h-9 md:text-sm">
          <option value="">Todos los estados</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
        </select>
        <input type="date" name="desde" defaultValue={from} aria-label="Desde" className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base md:min-h-9 md:text-sm" />
        <input type="date" name="hasta" defaultValue={to} aria-label="Hasta" className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base md:min-h-9 md:text-sm" />
        <button type="submit" className="col-span-2 min-h-11 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-surface-2 md:col-span-5 md:min-h-9 md:w-32">Filtrar</button>
      </form>
      <OrdersView businessId={id} orders={orders} products={products} today={todayISO()} openOrder={openOrder} />
      <div className="flex items-center justify-between text-sm">
        {orders.length >= limit ? <Link href={`?${more.toString()}`} className="text-accent">Ver más pedidos</Link> : <span className="text-muted">{orders.length} pedidos</span>}
        <a href={`/api/export/pedidos?negocio=${id}`} className="inline-flex min-h-10 items-center gap-1.5 text-muted hover:text-foreground"><Download className="size-4" aria-hidden /> Exportar CSV</a>
      </div>
    </div>
  );
}

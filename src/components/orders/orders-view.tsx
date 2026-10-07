"use client";

import { Check, Plus, Wallet } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setOrderStatus } from "@/app/(app)/negocios/actions";
import { markOrderPaid, markOrderUnpaid, restorePayments } from "@/app/(app)/negocios/payments-actions";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import type { Order, Product } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import type { OrderWithPayments } from "@/lib/orders/data";
import { PAY_CLASS, PAY_LABEL, payStatus } from "@/lib/orders/payments";
import { ORDER_STATUSES, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { OrderForm } from "./order-form";
import { PaymentForm } from "./order-payments";

function summary(o: Order) {
  return o.order_items.map((i) => `${i.quantity}× ${i.product_name}${i.color ? ` ${i.color}` : ""}${i.size ? ` ${i.size}` : ""}`).join(" · ");
}

/**
 * Lista de pedidos: estado del pedido + estado de pago al lado, acciones rápidas de cobro y botón «Nuevo pedido»
 * (en móvil, flotante sobre la barra inferior). El formulario se abre aparte (pantalla completa / panel lateral).
 * El detalle se abre con `?abrir=<id>` (lo carga el servidor con sus cobros); el pedido recién creado llega en `?nuevo=<id>`.
 */
export function OrdersView({ businessId, orders, products, today, openOrder, highlightId, hideList = false }: {
  businessId: string; orders: Order[]; products: Product[]; today: string; openOrder?: OrderWithPayments | null; highlightId?: string | null; hideList?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<Order | null>(null);
  const [busy, start] = useTransition();
  const toast = useToast();

  /** Cambiar el estado de pago desde la lista: «Pagado» apunta un cobro por lo que falte; «Pendiente» quita los cobros (con «Deshacer»). */
  const setPay = (o: Order, to: "paid" | "pending") => start(async () => {
    if (to === "paid") { const r = await markOrderPaid(o.id); toast({ message: r.ok ? "Marcado como pagado" : r.error }); }
    else {
      const r = await markOrderUnpaid(o.id);
      if (r.ok) toast({ message: "Marcado como no pagado", actionLabel: "Deshacer", onAction: () => void restorePayments(o.id, (r.removed ?? []) as never).then(() => router.refresh()) });
      else toast({ message: r.error });
    }
    router.refresh();
  });

  const go = (set: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(set)) { if (v) next.set(k, v); else next.delete(k); }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const open = (o: Order) => go({ abrir: o.id, nuevo: null });
  const closeDetail = () => go({ abrir: null });

  // El pedido nuevo se destaca un momento y se lleva a la vista.
  useEffect(() => {
    if (!highlightId) return;
    document.getElementById(`pedido-${highlightId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightId]);

  return (
    <>
      {!hideList && <>
      <div className="mb-3 hidden md:block"><Button onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden /> Nuevo pedido</Button></div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {orders.map((o) => {
          const st = payStatus(o);
          const left = Math.max(o.total_cents - o.paid_cents, 0);
          return (
            <li key={o.id} id={`pedido-${o.id}`} className={cn("flex flex-col gap-1 pb-2 transition-colors md:flex-row md:items-center md:gap-2 md:pb-0 md:pr-3", highlightId === o.id && "bg-accent/10 ring-2 ring-inset ring-accent")}>
              <button type="button" onClick={() => open(o)} className="flex min-h-14 min-w-0 flex-1 flex-col justify-center gap-0.5 px-4 py-2 text-left hover:bg-surface-2">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">{o.customer ?? (o.order_number ? `Pedido ${o.order_number}` : "Sin cliente")}</span>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${o.status === "cancelado" ? "text-muted line-through" : ""}`}>{formatEUR(o.total_cents)}</span>
                </span>
                <span className="truncate text-xs text-muted">{formatDate(o.order_date)} · {summary(o)}</span>
                {(st === "partial" || st === "pending") && <span className="text-xs text-bad">Falta cobrar {formatEUR(left)}</span>}
              </button>
              <div className="flex flex-wrap items-center gap-1.5 px-4 md:flex-nowrap md:px-0">
                <select
                  aria-label="Estado del pedido" value={o.status}
                  onChange={(e) => start(async () => { await setOrderStatus(o.id, e.target.value); router.refresh(); })}
                  className="min-h-11 shrink-0 rounded-full border-0 px-3 text-base font-semibold md:min-h-9 md:text-xs"
                  // El texto se mezcla con el color de texto del tema: legible (≥ 4,5:1) en claro y en oscuro.
                  style={{ backgroundColor: `${ORDER_STATUS_COLOR[o.status as OrderStatus]}1f`, color: `color-mix(in srgb, ${ORDER_STATUS_COLOR[o.status as OrderStatus]} 70%, var(--foreground))` }}
                >
                  {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
                </select>
                {st !== "cancelled" && (
                  <select aria-label="Estado de pago" value={st === "paid" ? "paid" : st === "unreviewed" ? "unreviewed" : st === "partial" ? "partial" : "pending"} disabled={busy}
                    onChange={(e) => setPay(o, e.target.value as "paid" | "pending")}
                    className={cn("min-h-11 shrink-0 rounded-full border-0 px-3 text-base font-semibold md:min-h-9 md:text-xs", PAY_CLASS[st])}>
                    {st === "unreviewed" && <option value="unreviewed" disabled>{PAY_LABEL.unreviewed}</option>}
                    <option value="pending">{PAY_LABEL.pending}</option>
                    {st === "partial" && <option value="partial" disabled>{PAY_LABEL.partial}</option>}
                    <option value="paid">{PAY_LABEL.paid}</option>
                  </select>
                )}
                {st !== "paid" && st !== "cancelled" && (
                  <>
                    <button type="button" disabled={busy} onClick={() => start(async () => { await markOrderPaid(o.id); router.refresh(); })}
                      className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-good hover:bg-surface-2 md:min-h-10" title="Registra un cobro por lo que falta, con fecha de hoy">
                      <Check className="size-4" aria-hidden /> Marcar como pagado
                    </button>
                    <button type="button" onClick={() => setPaying(o)} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground md:min-h-10">
                      <Wallet className="size-4" aria-hidden /> Añadir cobro
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
        {orders.length === 0 && <li className="p-6 text-center text-sm text-muted">No hay pedidos con estos filtros. Pulsa «Nuevo pedido» para crear uno.</li>}
      </ul>
      </>}

      {/* Móvil: siempre a mano, encima de la barra inferior. */}
      <button type="button" onClick={() => setCreating(true)} aria-label="Nuevo pedido"
        className="fixed right-4 z-30 inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-5 font-semibold text-accent-foreground shadow-lg md:hidden"
        style={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}>
        <Plus className="size-5" aria-hidden /> Nuevo pedido
      </button>

      <Sheet open={creating} onClose={() => setCreating(false)} title="Nuevo pedido" variant="panel">
        {creating && (
          <OrderForm key="new" businessId={businessId} order={null} products={products} today={today}
            onDone={(id) => { setCreating(false); if (id) go({ nuevo: id, abrir: null }); router.refresh(); }} />
        )}
      </Sheet>
      <Sheet open={!!openOrder} onClose={closeDetail} title="Detalle del pedido" variant="panel">
        {openOrder && <OrderForm key={openOrder.id} businessId={businessId} order={openOrder} products={products} today={today} onDone={() => { closeDetail(); router.refresh(); }} />}
      </Sheet>
      <Sheet open={!!paying} onClose={() => setPaying(null)} title={`Añadir cobro${paying?.customer ? ` · ${paying.customer}` : ""}`}>
        {paying && <PaymentForm order={paying} today={today} onDone={() => { setPaying(null); router.refresh(); }} />}
      </Sheet>
    </>
  );
}

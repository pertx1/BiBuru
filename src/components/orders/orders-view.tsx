"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setOrderStatus } from "@/app/(app)/negocios/actions";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import type { Order, Product } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { ORDER_STATUSES, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/schemas";
import { OrderForm } from "./order-form";

function summary(o: Order) {
  return o.order_items.map((i) => `${i.quantity}× ${i.product_name}${i.color ? ` ${i.color}` : ""}${i.size ? ` ${i.size}` : ""}`).join(" · ");
}

export function OrdersView({ businessId, orders, products, today }: { businessId: string; orders: Order[]; products: Product[]; today: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Order | "new" | null>(null);
  const [, start] = useTransition();
  const close = () => { setEditing(null); router.refresh(); };

  return (
    <>
      <div className="mb-3"><Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Nuevo pedido</Button></div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {orders.map((o) => (
          <li key={o.id} className="flex items-center gap-2 pr-3">
            <button type="button" onClick={() => setEditing(o)} className="flex min-h-14 min-w-0 flex-1 flex-col justify-center gap-0.5 px-4 py-2 text-left hover:bg-surface-2">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium">{o.customer ?? (o.order_number ? `Pedido ${o.order_number}` : "Sin cliente")}</span>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${o.status === "cancelado" ? "text-muted line-through" : ""}`}>{formatEUR(o.total_cents)}</span>
              </span>
              <span className="truncate text-xs text-muted">{formatDate(o.order_date)} · {summary(o)}</span>
            </button>
            <select
              aria-label="Estado del pedido" value={o.status}
              onChange={(e) => start(async () => { await setOrderStatus(o.id, e.target.value); router.refresh(); })}
              className="min-h-10 shrink-0 rounded-lg border bg-surface px-2 text-xs font-medium"
              style={{ borderColor: ORDER_STATUS_COLOR[o.status as OrderStatus], color: ORDER_STATUS_COLOR[o.status as OrderStatus] }}
            >
              {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
            </select>
          </li>
        ))}
        {orders.length === 0 && <li className="p-6 text-center text-sm text-muted">No hay pedidos con estos filtros. Pulsa «Nuevo pedido» para crear el primero.</li>}
      </ul>
      <Sheet open={editing !== null} onClose={close} title={editing === "new" ? "Nuevo pedido" : "Detalle del pedido"} className="md:max-w-2xl">
        {editing !== null && (
          <OrderForm key={editing === "new" ? "new" : editing.id} businessId={businessId} order={editing === "new" ? null : editing} products={products} today={today} onDone={close} />
        )}
      </Sheet>
    </>
  );
}

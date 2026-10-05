"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteOrder, saveOrder, type OrderPayload } from "@/app/(app)/negocios/actions";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { Order, Product } from "@/lib/data";
import { formatDecimal, formatEUR, orderTotals, toCents } from "@/lib/money";
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from "@/lib/schemas";

type Line = { key: string; product_id: string | null; product_name: string; color: string; size: string; quantity: string; unit_price: string; unit_cost: string };

const newLine = (): Line => ({ key: crypto.randomUUID(), product_id: null, product_name: "", color: "", size: "", quantity: "1", unit_price: "", unit_cost: "" });

export function orderToPayload(o: Order): OrderPayload {
  return {
    id: o.id, business_id: o.business_id, order_date: o.order_date, order_number: o.order_number ?? undefined,
    customer: o.customer ?? undefined, channel: o.channel ?? undefined, status: o.status as OrderPayload["status"], notes: o.notes ?? undefined,
    items: o.order_items.map((i) => ({
      product_id: i.product_id, product_name: i.product_name, color: i.color ?? undefined, size: i.size ?? undefined,
      quantity: i.quantity, unit_price: formatDecimal(i.unit_price_cents), unit_cost: formatDecimal(i.unit_cost_cents),
    })),
  };
}

export function OrderForm({
  businessId, order, products, today, onDone,
}: { businessId: string; order: Order | null; products: Product[]; today: string; onDone: () => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>(
    order && order.order_items.length
      ? order.order_items.map((i) => ({
          key: i.id, product_id: i.product_id, product_name: i.product_name, color: i.color ?? "", size: i.size ?? "",
          quantity: String(i.quantity), unit_price: formatDecimal(i.unit_price_cents), unit_cost: formatDecimal(i.unit_cost_cents),
        }))
      : [newLine()],
  );

  const totals = orderTotals(
    lines.map((l) => ({ quantity: Math.max(parseInt(l.quantity, 10) || 0, 0), unitPriceCents: toCents(l.unit_price) ?? 0, unitCostCents: toCents(l.unit_cost) ?? 0 })),
  );

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  /** Al elegir un producto del catálogo se rellenan precio y coste si estaban vacíos. */
  function onProductName(key: string, name: string) {
    const match = products.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        if (!match) return { ...l, product_name: name, product_id: null };
        return {
          ...l, product_name: match.name, product_id: match.id,
          unit_price: l.unit_price === "" ? formatDecimal(match.price_cents) : l.unit_price,
          unit_cost: l.unit_cost === "" ? formatDecimal(match.cost_cents) : l.unit_cost,
        };
      }),
    );
  }

  function submit(fd: FormData) {
    const payload: OrderPayload = {
      id: order?.id, business_id: businessId, order_date: String(fd.get("order_date")),
      order_number: String(fd.get("order_number") ?? ""), customer: String(fd.get("customer") ?? ""),
      channel: String(fd.get("channel") ?? ""), status: String(fd.get("status")) as OrderPayload["status"], notes: String(fd.get("notes") ?? ""),
      items: lines.map((l) => ({
        product_id: l.product_id, product_name: l.product_name, color: l.color, size: l.size,
        quantity: l.quantity, unit_price: l.unit_price, unit_cost: l.unit_cost,
      })),
    };
    start(async () => {
      const r = await saveOrder(payload);
      if (r.ok) onDone();
      else setError(r.error);
    });
  }

  function remove() {
    if (!order) return;
    const snapshot = orderToPayload(order);
    start(async () => {
      const r = await deleteOrder(order.id);
      if (!r.ok) return setError(r.error);
      onDone();
      toast({ message: "Pedido eliminado", actionLabel: "Deshacer", onAction: () => void saveOrder(snapshot) });
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha" htmlFor="o-date"><Input id="o-date" name="order_date" type="date" defaultValue={order?.order_date ?? today} required /></Field>
        <Field label="Estado" htmlFor="o-status">
          <Select id="o-status" name="status" defaultValue={order?.status ?? "sin_hacer"}>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
          </Select>
        </Field>
        <Field label="Cliente" htmlFor="o-customer"><Input id="o-customer" name="customer" defaultValue={order?.customer ?? ""} maxLength={120} autoComplete="off" /></Field>
        <Field label="Nº de pedido" htmlFor="o-number"><Input id="o-number" name="order_number" defaultValue={order?.order_number ?? ""} maxLength={40} autoComplete="off" /></Field>
        <Field label="Canal" htmlFor="o-channel" className="col-span-2"><Input id="o-channel" name="channel" defaultValue={order?.channel ?? ""} maxLength={60} placeholder="Instagram, web, Vinted…" /></Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Líneas del pedido</legend>
        <datalist id="products-list">{products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        {lines.map((l, idx) => (
          <div key={l.key} className="grid grid-cols-6 gap-2 rounded-lg border border-border p-3">
            <Input aria-label={`Producto de la línea ${idx + 1}`} placeholder="Producto" list="products-list" value={l.product_name} onChange={(e) => onProductName(l.key, e.target.value)} className="col-span-6" maxLength={80} required />
            <Input aria-label="Color" placeholder="Color" value={l.color} onChange={(e) => setLine(l.key, { color: e.target.value })} className="col-span-3" maxLength={40} />
            <Input aria-label="Talla" placeholder="Talla" value={l.size} onChange={(e) => setLine(l.key, { size: e.target.value })} className="col-span-3" maxLength={20} />
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">Cantidad
              <Input inputMode="numeric" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} required />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">Precio ud. (€)
              <Input inputMode="decimal" value={l.unit_price} onChange={(e) => setLine(l.key, { unit_price: e.target.value })} placeholder="0,00" required />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">Coste ud. (€)
              <Input inputMode="decimal" value={l.unit_cost} onChange={(e) => setLine(l.key, { unit_cost: e.target.value })} placeholder="0,00" />
            </label>
            {lines.length > 1 && (
              <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="col-span-6 flex min-h-10 items-center justify-center gap-1 text-xs text-muted hover:text-danger">
                <Trash2 className="size-3.5" aria-hidden /> Quitar línea
              </button>
            )}
          </div>
        ))}
        <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, newLine()])}><Plus className="size-4" aria-hidden /> Añadir línea</Button>
      </fieldset>

      <Field label="Notas" htmlFor="o-notes"><Textarea id="o-notes" name="notes" defaultValue={order?.notes ?? ""} maxLength={2000} className="min-h-16" /></Field>

      <dl className="grid grid-cols-3 gap-2 rounded-lg bg-surface-2 p-3 text-sm">
        <div><dt className="text-xs text-muted">Total</dt><dd className="font-semibold tabular-nums">{formatEUR(totals.totalCents)}</dd></div>
        <div><dt className="text-xs text-muted">Coste</dt><dd className="tabular-nums">{formatEUR(totals.costCents)}</dd></div>
        <div><dt className="text-xs text-muted">Beneficio</dt><dd className="font-semibold tabular-nums">{formatEUR(totals.profitCents)}</dd></div>
      </dl>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="flex-1">{pending ? "Guardando…" : "Guardar pedido"}</Button>
        {order && <Button type="button" variant="secondary" onClick={remove} disabled={pending}><Trash2 className="size-4" aria-hidden /> Eliminar</Button>}
      </div>
    </form>
  );
}

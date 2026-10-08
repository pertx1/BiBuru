"use client";

import { Link2, Link2Off, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteOrder, saveOrder, type OrderPayload } from "@/app/(app)/negocios/actions";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { Order, Product } from "@/lib/data";
import { formatDecimal, formatEUR, orderTotals, toCents } from "@/lib/money";
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from "@/lib/schemas";
import type { OrderWithPayments } from "@/lib/orders/data";
import { effectsText, resolveLineStock, type StockLinkContext } from "@/lib/stock/link";
import { OrderPayments } from "./order-payments";

type Line = { key: string; product_id: string | null; stock_key: string; product_name: string; color: string; size: string; quantity: string; unit_price: string; unit_cost: string };

const newLine = (): Line => ({ key: crypto.randomUUID(), product_id: null, stock_key: "", product_name: "", color: "", size: "", quantity: "1", unit_price: "", unit_cost: "" });

/** Borrador del pedido nuevo (si sales a medias se conserva en este dispositivo). */
type Draft = { fields: Record<string, string>; lines: Line[] };
export const draftKey = (businessId: string) => `biburu:pedido-borrador:${businessId}`;
function readDraft(businessId: string): Draft | null {
  try { const d = JSON.parse(localStorage.getItem(draftKey(businessId)) ?? "null") as Draft | null; return d && Array.isArray(d.lines) ? d : null; } catch { return null; }
}
export function clearDraft(businessId: string) { try { localStorage.removeItem(draftKey(businessId)); } catch { /* sin almacenamiento */ } }

export function orderToPayload(o: Order): OrderPayload {
  return {
    id: o.id, business_id: o.business_id, order_date: o.order_date, order_number: o.order_number ?? undefined,
    customer: o.customer ?? undefined, channel: o.channel ?? undefined, status: o.status as OrderPayload["status"], notes: o.notes ?? undefined,
    items: o.order_items.map((i) => ({
      product_id: i.product_id, stock_key: i.stock_key, product_name: i.product_name, color: i.color ?? undefined, size: i.size ?? undefined,
      quantity: i.quantity, unit_price: formatDecimal(i.unit_price_cents), unit_cost: formatDecimal(i.unit_cost_cents),
    })),
  };
}

type FormProps = {
  businessId: string; order: (Order & Partial<Pick<OrderWithPayments, "order_payments">>) | null; products: Product[]; today: string; onDone: (savedId?: string) => void;
  prefill?: { customer?: string; channel?: string };
  /** Inventario del negocio: cada línea se elige de aquí (y descuenta del stock). null = sin inventario. */
  stock?: StockLinkContext | null;
};

/** «Descartar» el borrador vuelve a montar el formulario en blanco. */
export function OrderForm(props: FormProps) {
  const [k, setK] = useState(0);
  return <OrderFormInner key={k} {...props} onDiscard={() => { clearDraft(props.businessId); setK((n) => n + 1); }} />;
}

function OrderFormInner({ businessId, order, products, today, onDone, onDiscard, prefill, stock = null }: FormProps & { onDiscard: () => void }) {
  const toast = useToast();
  const [draft] = useState<Draft | null>(() => (order ? null : readDraft(businessId)));
  const v = (k: string, fallback: string) => draft?.fields[k] ?? fallback;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>(
    draft ? draft.lines.map((l) => ({ ...l, stock_key: l.stock_key ?? "" })) : order && order.order_items.length
      ? order.order_items.map((i) => ({
          key: i.id, product_id: i.product_id, stock_key: i.stock_key ?? "", product_name: i.product_name, color: i.color ?? "", size: i.size ?? "",
          quantity: String(i.quantity), unit_price: formatDecimal(i.unit_price_cents), unit_cost: formatDecimal(i.unit_cost_cents),
        }))
      : [newLine()],
  );

  const totals = orderTotals(
    lines.map((l) => ({ quantity: Math.max(parseInt(l.quantity, 10) || 0, 0), unitPriceCents: toCents(l.unit_price) ?? 0, unitCostCents: toCents(l.unit_cost) ?? 0 })),
  );

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  // Pedido anterior al descuento automático: solo descuentan las líneas a las que elijas un artículo (ver `saveOrder`).
  const legacy = !!order && order.order_items.length > 0 && order.order_items.every((i) => i.stock_effects == null && i.stock_key == null);
  const effectsOf = (l: Line) => (stock && (!legacy || l.stock_key) ? resolveLineStock({ ...l, quantity: parseInt(l.quantity, 10) || 0 }, stock) : []);

  /** Elegir un artículo del inventario: lo vincula y, si la línea estaba vacía, rellena el nombre (y la talla de la prenda). */
  function onStockPick(key: string, stockKey: string) {
    const opt = stock?.options.find((o) => o.key === stockKey);
    setLines((ls) => ls.map((l) => {
      if (l.key !== key) return l;
      if (!opt) return { ...l, stock_key: "" };
      const [, a, b] = stockKey.split("|");
      const name = l.product_name.trim() ? l.product_name : opt.group === "prendas" ? opt.label.replace(new RegExp(` ${b}$`), "") : opt.label;
      return { ...l, stock_key: stockKey, product_name: name.slice(0, 80), size: opt.group === "prendas" && !l.size ? b : l.size, color: opt.group === "prendas" && !l.color ? a : l.color };
    }));
  }

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
        product_id: l.product_id, stock_key: l.stock_key || null, product_name: l.product_name, color: l.color, size: l.size,
        quantity: l.quantity, unit_price: l.unit_price, unit_cost: l.unit_cost,
      })),
    };
    start(async () => {
      const r = await saveOrder(payload);
      if (r.ok) { if (!order) clearDraft(businessId); if (r.warning) toast({ message: r.warning }); onDone(r.id); }
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

  const formRef = useRef<HTMLFormElement>(null);
  const dirty = useRef(false);
  // Las líneas viven en el estado: se guardan en el borrador cuando cambian (solo si ya se ha tocado algo).
  useEffect(() => { if (dirty.current && formRef.current) saveDraft(formRef.current, lines); }, [lines]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Guarda el borrador del pedido nuevo con cada cambio. */
  function saveDraft(form: HTMLFormElement, ls = lines) {
    if (order) return;
    const fields = Object.fromEntries([...new FormData(form).entries()].map(([k, x]) => [k, String(x)]));
    try { localStorage.setItem(draftKey(businessId), JSON.stringify({ fields, lines: ls })); } catch { /* sin almacenamiento */ }
  }

  return (
    <form ref={formRef} action={submit} onChange={(e) => { dirty.current = true; saveDraft(e.currentTarget); }} className="flex flex-col gap-4">
      {draft && <p className="flex items-center justify-between gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm">Borrador recuperado.
        <button type="button" className="min-h-11 md:min-h-10 text-xs font-semibold underline" onClick={onDiscard}>Descartar</button></p>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha" htmlFor="o-date"><Input id="o-date" name="order_date" type="date" defaultValue={v("order_date", order?.order_date ?? today)} required /></Field>
        <Field label="Estado" htmlFor="o-status">
          <Select id="o-status" name="status" defaultValue={v("status", order?.status ?? "sin_hacer")}>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
          </Select>
        </Field>
        <Field label="Cliente" htmlFor="o-customer"><Input id="o-customer" name="customer" defaultValue={v("customer", order?.customer ?? prefill?.customer ?? "")} maxLength={120} autoComplete="off" /></Field>
        <Field label="Nº de pedido" htmlFor="o-number"><Input id="o-number" name="order_number" defaultValue={v("order_number", order?.order_number ?? "")} maxLength={40} autoComplete="off" /></Field>
        <Field label="Canal" htmlFor="o-channel" className="col-span-2"><Input id="o-channel" name="channel" defaultValue={v("channel", order?.channel ?? prefill?.channel ?? "")} maxLength={60} placeholder="Instagram, web, Vinted…" /></Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Líneas del pedido</legend>
        <datalist id="products-list">{products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        {lines.map((l, idx) => (
          <div key={l.key} className="grid grid-cols-6 gap-2 rounded-lg border border-border p-3">
            {stock && stock.options.length > 0 && (
              <Select aria-label={`Artículo del stock de la línea ${idx + 1}`} value={l.stock_key} onChange={(e) => onStockPick(l.key, e.target.value)} className="col-span-6">
                <option value="">{legacy ? "Pedido anterior: elige un artículo para descontarlo" : "Artículo del stock (o se reconoce solo)"}</option>
                {(["prendas", "dtf", "articulos"] as const).map((g) => {
                  const opts = stock.options.filter((o) => o.group === g);
                  return opts.length ? <optgroup key={g} label={g === "prendas" ? "Prendas" : g === "dtf" ? "DTF" : "Materiales y productos"}>{opts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</optgroup> : null;
                })}
              </Select>
            )}
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
            {stock && (() => {
              const eff = effectsOf(l);
              return (
                <p className={`col-span-6 flex items-start gap-1.5 text-xs ${eff.length ? "text-muted" : "text-amber-700 dark:text-amber-400"}`}>
                  {eff.length ? <Link2 className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <Link2Off className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
                  <span>{eff.length ? effectsText(eff) : legacy ? "Pedido anterior: no descuenta del stock" : "Sin vincular al stock: esta línea no descuenta. Elige el artículo arriba."}</span>
                </p>
              );
            })()}
            {lines.length > 1 && (
              <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="col-span-6 flex min-h-11 md:min-h-10 items-center justify-center gap-1 text-xs text-muted hover:text-danger">
                <Trash2 className="size-3.5" aria-hidden /> Quitar línea
              </button>
            )}
          </div>
        ))}
        <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, newLine()])}><Plus className="size-4" aria-hidden /> Añadir línea</Button>
      </fieldset>

      <Field label="Notas" htmlFor="o-notes"><Textarea id="o-notes" name="notes" defaultValue={v("notes", order?.notes ?? "")} maxLength={2000} className="min-h-16" /></Field>

      <dl className="grid grid-cols-3 gap-2 rounded-lg bg-surface-2 p-3 text-sm">
        <div><dt className="text-xs text-muted">Total</dt><dd className="font-semibold tabular-nums">{formatEUR(totals.totalCents)}</dd></div>
        <div><dt className="text-xs text-muted">Coste</dt><dd className="tabular-nums">{formatEUR(totals.costCents)}</dd></div>
        <div><dt className="text-xs text-muted">Beneficio</dt><dd className="font-semibold tabular-nums">{formatEUR(totals.profitCents)}</dd></div>
      </dl>

      {order && <OrderPayments order={order} today={today} />}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="sticky bottom-0 -mx-4 flex gap-2 bg-surface/95 px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur md:static md:mx-0 md:bg-transparent md:p-0">
        <Button type="submit" disabled={pending} className="flex-1">{pending ? "Guardando…" : "Guardar pedido"}</Button>
        {order && <Button type="button" variant="secondary" onClick={remove} disabled={pending}><Trash2 className="size-4" aria-hidden /> Eliminar</Button>}
      </div>
    </form>
  );
}

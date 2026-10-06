"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { addPayment, deletePayment } from "@/app/(app)/negocios/payments-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/dates";
import { formatDecimal, formatEUR } from "@/lib/money";
import { METHOD_LABEL, PAY_CLASS, PAY_LABEL, PAYMENT_METHODS, payStatus, type PaymentMethod } from "@/lib/orders/payments";
import type { Payment } from "@/lib/orders/data";
import { cn } from "@/lib/utils";

type OrderLite = { id: string; status: string; payment_reviewed: boolean; total_cents: number; paid_cents: number; order_payments?: Payment[] };

/** Formulario corto de cobro (en el detalle del pedido y en «Añadir cobro» de la lista). */
export function PaymentForm({ order, today, onDone }: { order: OrderLite; today: string; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const left = Math.max(order.total_cents - order.paid_cents, 0);
  const [amount, setAmount] = useState(left ? formatDecimal(left) : "");
  const [method, setMethod] = useState<PaymentMethod>("bizum");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  return (
    <form className="grid grid-cols-2 gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await addPayment({ orderId: order.id, paidOn: date, amount, method, note }); if (r.ok) onDone(); else setError(r.error); }); }}>
      <label className="flex flex-col gap-1 text-xs text-muted">Importe (€)<Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
      <label className="flex flex-col gap-1 text-xs text-muted">Fecha<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
      <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">Método
        <div className="flex flex-wrap gap-1.5">{PAYMENT_METHODS.map((m) => (
          <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m} className={cn("min-h-10 rounded-full border px-3 text-sm", method === m ? "border-accent bg-accent/15 font-semibold text-foreground" : "border-border text-muted")}>{METHOD_LABEL[m]}</button>
        ))}</div>
      </label>
      <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">Nota (opcional)<Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></label>
      {error && <p role="alert" className="col-span-2 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={pending} className="col-span-2">{pending ? "Guardando…" : "Guardar cobro"}</Button>
    </form>
  );
}

/** Cobros de un pedido: estado, lista, pendiente y alta. */
export function OrderPayments({ order, today }: { order: OrderLite; today: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const st = payStatus(order);
  const left = Math.max(order.total_cents - order.paid_cents, 0);
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Cobros</h3>
        <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", PAY_CLASS[st])}>{PAY_LABEL[st]}</span>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-xs text-muted">Cobrado</dt><dd className="font-semibold tabular-nums">{formatEUR(order.paid_cents)}</dd></div>
        <div><dt className="text-xs text-muted">Pendiente</dt><dd className={cn("font-semibold tabular-nums", left > 0 && st !== "unreviewed" && "text-bad")}>{formatEUR(st === "cancelled" ? 0 : left)}</dd></div>
      </dl>
      {st === "unreviewed" && <p className="text-xs text-muted">Pedido anterior a los cobros: no cuenta como deuda hasta que lo revises (añade un cobro o márcalo en la lista).</p>}
      {(order.order_payments ?? []).length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {order.order_payments!.sort((a, b) => a.paid_on.localeCompare(b.paid_on)).map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-1.5">
              <span className="w-20 shrink-0 text-xs tabular-nums text-muted">{formatDate(p.paid_on)}</span>
              <span className="min-w-0 flex-1 truncate">{METHOD_LABEL[p.method as PaymentMethod] ?? p.method}{p.note ? ` · ${p.note}` : ""}</span>
              <span className="tabular-nums">{formatEUR(p.amount_cents)}</span>
              <button type="button" className="flex size-10 items-center justify-center text-muted hover:text-danger" disabled={pending} aria-label="Borrar cobro"
                onClick={() => { if (confirm("¿Borrar este cobro?")) start(async () => { await deletePayment(p.id); router.refresh(); }); }}><Trash2 className="size-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      {st !== "cancelled" && (adding
        ? <PaymentForm order={order} today={today} onDone={() => { setAdding(false); router.refresh(); }} />
        : <Button type="button" variant="secondary" onClick={() => setAdding(true)}>Añadir cobro</Button>)}
    </section>
  );
}

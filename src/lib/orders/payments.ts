/** Cobros y deuda de pedidos: lógica pura (probada en tests), válida en cliente y servidor. */
import { addDays, diffDays, startOfMonth, startOfWeek } from "@/lib/dates";

export const PAYMENT_METHODS = ["bizum", "efectivo", "transferencia", "tarjeta", "otro"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const METHOD_LABEL: Record<PaymentMethod, string> = { bizum: "Bizum", efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", otro: "Otro" };

export type PayStatus = "unreviewed" | "pending" | "partial" | "paid" | "cancelled";
export const PAY_LABEL: Record<PayStatus, string> = { unreviewed: "Sin revisar", pending: "Pendiente", partial: "Pago parcial", paid: "Pagado", cancelled: "—" };
export const PAY_CLASS: Record<PayStatus, string> = {
  unreviewed: "border-border text-muted", pending: "border-bad/50 text-bad", partial: "border-amber-500/60 text-amber-600 dark:text-amber-400",
  paid: "border-good/50 text-good", cancelled: "border-border text-muted",
};

export type PayFields = { status: string; payment_reviewed: boolean; total_cents: number; paid_cents: number };

/** Estado de pago de un pedido a partir de sus cobros. Sin revisar = pedido anterior a los cobros: no cuenta como deuda. */
export function payStatus(o: PayFields): PayStatus {
  if (o.status === "cancelado") return "cancelled";
  if (!o.payment_reviewed) return "unreviewed";
  if (o.paid_cents >= o.total_cents) return "paid";
  return o.paid_cents > 0 ? "partial" : "pending";
}
export const dueOf = (o: PayFields) => (payStatus(o) === "pending" || payStatus(o) === "partial" ? Math.max(o.total_cents - o.paid_cents, 0) : 0);

export type AgingBucket = "0-7" | "8-30" | "30+";
export const AGING_LABEL: Record<AgingBucket, string> = { "0-7": "0–7 días", "8-30": "8–30 días", "30+": "Más de 30 días" };
export const agingBucket = (days: number): AgingBucket => (days <= 7 ? "0-7" : days <= 30 ? "8-30" : "30+");

export type DueOrder = { id: string; customer: string | null; order_number: string | null; order_date: string; due_cents: number; business_id: string };
export type Debtor = { key: string; customer: string; dueCents: number; orders: DueOrder[]; oldestDays: number };

const normalizeName = (s: string | null) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** «Quién me debe»: agrupa por cliente (sin distinguir mayúsculas ni espacios), de mayor a menor deuda. */
export function debtors(orders: DueOrder[], today: string): Debtor[] {
  const map = new Map<string, Debtor>();
  for (const o of orders) {
    if (o.due_cents <= 0) continue;
    const key = normalizeName(o.customer) || "sin-cliente";
    const d = map.get(key) ?? { key, customer: o.customer?.trim() || "Sin cliente", dueCents: 0, orders: [], oldestDays: 0 };
    d.dueCents += o.due_cents;
    d.orders.push(o);
    d.oldestDays = Math.max(d.oldestDays, diffDays(o.order_date, today));
    map.set(key, d);
  }
  return [...map.values()].sort((a, b) => b.dueCents - a.dueCents || b.oldestDays - a.oldestDays);
}

/** Resumen «Me deben»: total, nº de pedidos, días de la deuda más vieja y reparto por antigüedad. */
export function receivables(orders: DueOrder[], today: string) {
  const due = orders.filter((o) => o.due_cents > 0);
  const aging: Record<AgingBucket, number> = { "0-7": 0, "8-30": 0, "30+": 0 };
  for (const o of due) aging[agingBucket(diffDays(o.order_date, today))] += o.due_cents;
  return {
    totalCents: due.reduce((s, o) => s + o.due_cents, 0), count: due.length,
    oldestDays: due.reduce((m, o) => Math.max(m, diffDays(o.order_date, today)), 0), aging,
  };
}

// ------------------------------------------------------------------ filtros de pedidos
export type DatePreset = "hoy" | "semana" | "mes" | "rango";
export type OrderFilters = {
  q?: string; status?: string; pay?: PayStatus; preset?: DatePreset; from?: string; to?: string;
  customer?: string; product?: string; channel?: string;
};
export const FILTER_KEYS = ["q", "estado", "pago", "fecha", "desde", "hasta", "cliente", "producto", "canal"] as const;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v: unknown, max = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** Lee los filtros de la URL (valores desconocidos se ignoran) y traduce el periodo a fechas. */
export function parseOrderFilters(sp: Record<string, string | undefined>, today: string, statuses: readonly string[]): OrderFilters {
  const f: OrderFilters = {};
  f.q = clean(sp.q);
  if (sp.estado && statuses.includes(sp.estado)) f.status = sp.estado;
  if (sp.pago && ["unreviewed", "pending", "partial", "paid"].includes(sp.pago)) f.pay = sp.pago as PayStatus;
  f.customer = clean(sp.cliente); f.product = clean(sp.producto); f.channel = clean(sp.canal, 60);
  const preset = (["hoy", "semana", "mes", "rango"] as const).find((p) => p === sp.fecha);
  if (preset === "hoy") { f.preset = preset; f.from = today; f.to = today; }
  else if (preset === "semana") { f.preset = preset; f.from = startOfWeek(today); f.to = addDays(startOfWeek(today), 6); }
  else if (preset === "mes") { f.preset = preset; f.from = startOfMonth(today); f.to = today; }
  else {
    const from = sp.desde && ISO.test(sp.desde) ? sp.desde : undefined, to = sp.hasta && ISO.test(sp.hasta) ? sp.hasta : undefined;
    if (from || to) { f.preset = "rango"; f.from = from; f.to = to; }
  }
  for (const k of Object.keys(f) as (keyof OrderFilters)[]) if (f[k] === undefined) delete f[k];
  return f;
}

export const hasFilters = (f: OrderFilters) => Object.keys(f).length > 0;

/** Totales de lo filtrado: nº, importe, cobrado, pendiente y beneficio (cancelados fuera). */
export function filteredTotals(rows: (PayFields & { cost_cents: number; due_cents: number })[]) {
  const live = rows.filter((r) => r.status !== "cancelado");
  return {
    count: rows.length,
    totalCents: live.reduce((s, r) => s + r.total_cents, 0),
    paidCents: live.reduce((s, r) => s + r.paid_cents, 0),
    dueCents: live.reduce((s, r) => s + r.due_cents, 0),
    profitCents: live.reduce((s, r) => s + r.total_cents - r.cost_cents, 0),
  };
}

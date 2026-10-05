import { formatDate } from "@/lib/dates";
import { formatDecimal } from "@/lib/money";

/**
 * CSV para Excel en España: separador ";", decimales con coma y BOM UTF-8.
 * Las celdas que empiezan por = + - @ se neutralizan (inyección de fórmulas).
 */
export function csvCell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

export type OrderRow = {
  order_date: string; order_number: string | null; customer: string | null; channel: string | null; status: string;
  total_cents: number; cost_cents: number; order_items: { product_name: string; color: string | null; size: string | null; quantity: number; unit_price_cents: number; unit_cost_cents: number }[];
};

/** Una fila por línea de pedido (los datos del pedido se repiten). */
export function ordersToCsv(orders: OrderRow[]): string {
  const rows = orders.flatMap((o) =>
    o.order_items.map((i) => [
      formatDate(o.order_date), o.order_number, o.customer, o.channel, o.status, i.product_name, i.color, i.size, i.quantity,
      formatDecimal(i.unit_price_cents), formatDecimal(i.unit_cost_cents), formatDecimal(i.quantity * i.unit_price_cents), formatDecimal(o.total_cents),
    ]),
  );
  return toCsv(["Fecha", "Nº pedido", "Cliente", "Canal", "Estado", "Producto", "Color", "Talla", "Cantidad", "Precio ud.", "Coste ud.", "Total línea", "Total pedido"], rows);
}

export type ExpenseRow = {
  expense_date: string; concept: string | null; amount_cents: number; supplier: string | null; payment_method: string | null;
  recurrence: string | null; expense_categories: { name: string } | null;
};
export function expensesToCsv(expenses: ExpenseRow[]): string {
  return toCsv(
    ["Fecha", "Concepto", "Categoría", "Importe", "Proveedor", "Método de pago", "Recurrente"],
    expenses.map((e) => [formatDate(e.expense_date), e.concept, e.expense_categories?.name, formatDecimal(e.amount_cents), e.supplier, e.payment_method, e.recurrence]),
  );
}

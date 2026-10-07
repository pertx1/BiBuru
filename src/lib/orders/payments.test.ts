import { describe, expect, it } from "vitest";
import { agingBucket, debtors, dueOf, filteredTotals, hasFilters, parseOrderFilters, payStatus, receivables, type DueOrder } from "./payments";

const S = ["sin_hacer", "en_casa", "en_paquete", "enviado", "cancelado"];
const o = (p: Partial<{ status: string; payment_reviewed: boolean; total_cents: number; paid_cents: number }>) =>
  ({ status: "sin_hacer", payment_reviewed: true, total_cents: 1000, paid_cents: 0, ...p });

describe("estado de pago", () => {
  it("pendiente, parcial, pagado, sin revisar y cancelado", () => {
    expect(payStatus(o({}))).toBe("pending");
    expect(payStatus(o({ paid_cents: 400 }))).toBe("partial");
    expect(payStatus(o({ paid_cents: 1000 }))).toBe("paid");
    expect(payStatus(o({ paid_cents: 1200 }))).toBe("paid");
    expect(payStatus(o({ payment_reviewed: false }))).toBe("unreviewed");
    expect(payStatus(o({ status: "cancelado", paid_cents: 0 }))).toBe("cancelled");
  });
  it("solo lo revisado y no cancelado es deuda", () => {
    expect(dueOf(o({ paid_cents: 400 }))).toBe(600);
    expect(dueOf(o({ payment_reviewed: false }))).toBe(0);
    expect(dueOf(o({ status: "cancelado" }))).toBe(0);
  });
  it("antigüedad 0-7, 8-30, más de 30", () => {
    expect([0, 7, 8, 30, 31].map(agingBucket)).toEqual(["0-7", "0-7", "8-30", "8-30", "30+"]);
  });
});

describe("quién me debe", () => {
  const due: DueOrder[] = [
    { id: "1", customer: "Ana López", order_number: null, order_date: "2026-10-01", due_cents: 1000, business_id: "b" },
    { id: "2", customer: " ana  lópez ", order_number: "7", order_date: "2026-08-01", due_cents: 500, business_id: "b" },
    { id: "3", customer: "Luis", order_number: null, order_date: "2026-10-05", due_cents: 2000, business_id: "b" },
    { id: "4", customer: null, order_number: null, order_date: "2026-10-06", due_cents: 0, business_id: "b" },
  ];
  it("agrupa por cliente sin mayúsculas ni espacios y ordena de mayor a menor", () => {
    const d = debtors(due, "2026-10-06");
    expect(d.map((x) => [x.customer, x.dueCents, x.orders.length, x.oldestDays])).toEqual([["Luis", 2000, 1, 1], ["Ana López", 1500, 2, 66]]);
  });
  it("resumen: total, nº, más antigua y reparto por antigüedad", () => {
    expect(receivables(due, "2026-10-06")).toEqual({ totalCents: 3500, count: 3, oldestDays: 66, aging: { "0-7": 3000, "8-30": 0, "30+": 500 } });
    expect(receivables([], "2026-10-06")).toMatchObject({ totalCents: 0, count: 0, oldestDays: 0 });
  });
});

describe("filtros", () => {
  it("lee la URL, ignora valores raros y traduce los periodos (semana desde lunes)", () => {
    expect(parseOrderFilters({}, "2026-10-08", S)).toEqual({});
    expect(hasFilters(parseOrderFilters({ estado: "nope", pago: "x", desde: "ayer" }, "2026-10-08", S))).toBe(false);
    expect(parseOrderFilters({ fecha: "semana", estado: "enviado", pago: "partial", q: "  ana " }, "2026-10-08", S))
      .toEqual({ preset: "semana", from: "2026-10-05", to: "2026-10-11", status: "enviado", pay: "partial", q: "ana" });
    expect(parseOrderFilters({ fecha: "mes" }, "2026-10-08", S)).toMatchObject({ from: "2026-10-01", to: "2026-10-08" });
    expect(parseOrderFilters({ fecha: "rango", desde: "2026-01-01" }, "2026-10-08", S)).toEqual({ preset: "rango", from: "2026-01-01" });
  });
  it("totales de lo filtrado sin cancelados", () => {
    expect(filteredTotals([
      { status: "enviado", payment_reviewed: true, total_cents: 1000, paid_cents: 400, cost_cents: 300, due_cents: 600 },
      { status: "cancelado", payment_reviewed: true, total_cents: 9000, paid_cents: 0, cost_cents: 0, due_cents: 0 },
    ])).toEqual({ count: 2, totalCents: 1000, paidCents: 400, dueCents: 600, profitCents: 700 });
  });
});

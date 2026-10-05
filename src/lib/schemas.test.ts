import { describe, expect, it } from "vitest";
import { expenseSchema, orderSchema } from "./schemas";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("validación de formularios", () => {
  it("gasto: convierte el importe a céntimos y limpia vacíos", () => {
    const r = expenseSchema.parse({
      business_id: uuid, expense_date: "2026-03-05", amount: "12,50", concept: " Cinta ", supplier: "", recurrence: "",
    });
    expect(r.amount).toBe(1250);
    expect(r.concept).toBe("Cinta");
    expect(r.supplier).toBeUndefined();
    expect(r.recurrence).toBeUndefined();
  });
  it("gasto: rechaza importe 0, texto o fecha imposible", () => {
    const base = { business_id: uuid, expense_date: "2026-03-05", amount: "10" };
    expect(expenseSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...base, amount: "abc" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...base, expense_date: "2026-02-30" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...base, business_id: "no-uuid" }).success).toBe(false);
  });
  it("pedido: exige líneas y cantidades enteras", () => {
    const base = { business_id: uuid, order_date: "2026-03-05", status: "sin_hacer" };
    expect(orderSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(orderSchema.safeParse({ ...base, items: [{ product_name: "Camiseta", quantity: 1.5, unit_price: "10" }] }).success).toBe(false);
    const ok = orderSchema.parse({ ...base, items: [{ product_name: "Camiseta", quantity: "2", unit_price: "25", unit_cost: "" }] });
    expect(ok.items[0]).toMatchObject({ quantity: 2, unit_price: 2500, unit_cost: 0 });
  });
  it("pedido: estado desconocido no vale", () => {
    expect(orderSchema.safeParse({ business_id: uuid, order_date: "2026-03-05", status: "raro", items: [{ product_name: "x", quantity: 1, unit_price: "1" }] }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { buildPlan, expectedTotals, toImportDate, type Source } from "./profity-import";

const src: Source = {
  expenses: [
    { id: "e1", date: new Date("2026-03-05T00:00:00Z"), category: "Materiales", concept: "Tela", amount: 120.5, paymentMethod: "Tarjeta" },
    { id: "e2", date: new Date("2026-03-06T00:00:00Z"), category: "materiales", concept: "", amount: 0.1 + 0.2, paymentMethod: null },
    { id: "e3", date: new Date("2026-03-07T00:00:00Z"), category: "Vinted", concept: "Chaqueta · talla M", amount: 15, paymentMethod: null },
    { id: "e4", date: new Date("2026-03-08T00:00:00Z"), category: "Otros", concept: null, amount: 0, paymentMethod: null },
  ],
  incomes: [
    { id: "i1", date: new Date("2026-03-09T00:00:00Z"), source: "Vinted", concept: "Chaqueta", amount: 30, method: null },
    { id: "i2", date: new Date("2026-03-10T00:00:00Z"), source: "Bizum", concept: null, amount: 10.99, method: "Bizum" },
  ],
  orders: [
    { id: "o1", orderNumber: "A-1", date: new Date("2026-03-11T00:00:00Z"), quantity: 2, model: "Camiseta", color: "Negra", size: "M", price: 50, status: "ENVIADO" },
    { id: "o2", orderNumber: null, date: new Date("2026-03-12T00:00:00Z"), quantity: 3, model: "Camiseta", color: null, size: null, price: 100, status: "CANCELADO" },
    { id: "o3", orderNumber: "Ana", date: new Date("2026-03-13T10:00:00Z"), quantity: 1, model: "Sudadera", color: "Gris", size: "L", price: 45.9, status: "SIN_HACER" },
  ],
};

describe("importación de PROFITY", () => {
  it("fechas: medianoche UTC conserva el día; con hora usa Madrid", () => {
    expect(toImportDate(new Date("2026-03-05T00:00:00Z"))).toBe("2026-03-05");
    expect(toImportDate(new Date("2026-03-05T23:30:00Z"))).toBe("2026-03-06"); // 00:30 en Madrid
    expect(toImportDate("2026-07-01T20:00:00Z")).toBe("2026-07-01");
  });

  it("convierte a céntimos, omite inválidos y avisa", () => {
    const p = buildPlan(src, { separateVinted: true });
    expect(p.expenses.map((e) => e.amount_cents)).toEqual([12050, 30, 1500]);
    expect(p.warnings.some((w) => w.includes("e4"))).toBe(true);
    expect(p.categories).toEqual(["Materiales", "Vinted"]); // "materiales" no duplica
  });

  it("separa Vinted solo si se pide", () => {
    const sep = buildPlan(src, { separateVinted: true });
    expect(sep.expenses.find((e) => e.external_id.endsWith("e3"))!.biz).toBe("vinted");
    expect(sep.incomes.find((i) => i.external_id.endsWith("i1"))!.biz).toBe("vinted");
    expect(sep.incomes.find((i) => i.external_id.endsWith("i2"))!.biz).toBe("main");
    const all = buildPlan(src, { separateVinted: false });
    expect([...all.expenses, ...all.incomes].every((r) => r.biz === "main")).toBe(true);
  });

  it("pedidos: total exacto, estado, líneas y productos", () => {
    const p = buildPlan(src, { separateVinted: false });
    const o1 = p.orders[0];
    expect(o1.items).toEqual([{ product_name: "Camiseta", color: "Negra", size: "M", quantity: 2, unit_price_cents: 2500 }]);
    expect(o1.status).toBe("enviado");
    // 100 € / 3 no es exacto: 1 línea con el total exacto
    const o2 = p.orders[1];
    expect(o2.items[0]).toMatchObject({ quantity: 1, unit_price_cents: 10000 });
    expect(o2.notes).toContain("cantidad original 3");
    for (const o of p.orders) {
      expect(o.items.reduce((s, i) => s + i.quantity * i.unit_price_cents, 0)).toBe(o.total_cents);
    }
    expect(p.products.find((x) => x.name === "Camiseta")!.price_cents).toBe(2500); // ignora cancelados
  });

  it("totales esperados coinciden con la suma de los datos de origen", () => {
    const t = expectedTotals(buildPlan(src, { separateVinted: true }));
    expect(t.expenses).toEqual({ count: 3, totalCents: 12050 + 30 + 1500 });
    expect(t.incomes).toEqual({ count: 2, totalCents: 3000 + 1099 });
    expect(t.orders).toEqual({ count: 3, totalCents: 5000 + 10000 + 4590 });
    expect(t.ordersActive).toEqual({ count: 2, totalCents: 5000 + 4590 });
  });

  it("producción: stock, diseños, reglas y facturas", () => {
    const p = buildPlan({
      ...src,
      tshirtStocks: [{ model: "SUDADERA_NEGRA", size: "m", quantity: 4 }, { model: "BLANCA", size: "L", quantity: -1 }],
      dtfStocks: [{ name: "Ujue", variant: "BLANCO", quantity: 2 }, { name: "Ujue", variant: "NEGRO", quantity: 0 }, { name: "BA Azul", variant: "UNICO", quantity: 7 }, { name: "X", variant: "RARO", quantity: 1 }],
      shirtRules: [{ shirtColor: "Roja", dtfColor: "Blanco" }], designRules: [{ design: "Ujue", dtfColor: "Todo color" }],
      invoices: [{ id: "f1", name: "Luz", url: "https://x.com/luz" }, { id: "f2", name: "Mala", url: "javascript:alert(1)" }],
    }, { separateVinted: false });
    expect(p.production.tshirtStocks).toEqual([{ model: "Sudadera negra", size: "M", quantity: 4 }, { model: "Blanca", size: "L", quantity: -1 }]);
    expect(p.production.designs).toEqual([{ name: "Ujue", kind: "paired" }, { name: "BA Azul", kind: "standalone" }]);
    expect(p.production.dtfStocks).toHaveLength(3);
    expect(p.production.shirtRules[0].shirt_color_key).toBe("roj"); // "Roja" y "Rojo" comparten clave
    expect(p.production.invoices).toHaveLength(1);
    expect(p.warnings.some((w) => w.includes("Mala"))).toBe(true);
    expect(p.warnings.some((w) => w.includes("RARO"))).toBe(true);
    const t = expectedTotals(p);
    expect(t.tshirtStocks).toEqual({ count: 2, totalCents: 3 });
    expect(t.dtfStocks).toEqual({ count: 3, totalCents: 9 });
  });

  it("es determinista y los external_id no se repiten (reimportar no duplica)", () => {
    const a = buildPlan(src, { separateVinted: true });
    const b = buildPlan(src, { separateVinted: true });
    expect(a).toEqual(b);
    const ids = [...a.orders, ...a.expenses, ...a.incomes].map((r) => r.external_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

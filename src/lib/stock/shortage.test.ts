import { describe, expect, it } from "vitest";
import { dueFor, lineMatches, planTasks, reserveGeneric, shortages, taskTitle, withMissing, type StockEntry } from "./shortage";

const e = (p: Partial<StockEntry>): StockEntry => ({ key: "k", group: "articulos", label: "Camiseta negra M", base: 0, min: 0, reserved: 0, oldestOrder: null, ...p });

describe("lo que falta", () => {
  it("pedidos sin cubrir y bajo el mínimo", () => {
    expect(withMissing(e({ base: 4, reserved: 10 }))).toMatchObject({ available: -6, missing: 6 });
    expect(withMissing(e({ base: 4, reserved: 1, min: 5 }))).toMatchObject({ available: 3, missing: 2 });
    expect(withMissing(e({ base: 10, reserved: 2, min: 5 }))).toMatchObject({ available: 8, missing: 0 });
    expect(withMissing(e({ base: 0 })).missing).toBe(0); // a 0 sin pedidos ni mínimo no falta nada
  });
  it("primero lo que bloquea pedidos y el pedido más antiguo", () => {
    const r = shortages([e({ key: "min", base: 1, min: 3 }), e({ key: "new", base: 0, reserved: 2, oldestOrder: "2026-10-05" }), e({ key: "old", base: 0, reserved: 1, oldestOrder: "2026-10-01" })]);
    expect(r.map((x) => x.key)).toEqual(["old", "new", "min"]);
  });
  it("título y fecha límite", () => {
    expect(taskTitle({ label: "Camiseta negra M", missing: 6 })).toBe("Reponer: Camiseta negra M, faltan 6");
    expect(dueFor({ oldestOrder: "2026-10-05", reserved: 3, base: 0 }, "2026-10-06")).toBe("2026-10-08");
    expect(dueFor({ oldestOrder: "2026-09-01", reserved: 3, base: 0 }, "2026-10-06")).toBe("2026-10-06");
    expect(dueFor({ oldestOrder: null, reserved: 0, base: 0 }, "2026-10-06")).toBe("2026-10-13");
  });
});

describe("tareas de reposición", () => {
  const today = "2026-10-06";
  const lines = shortages([e({ key: "a", base: 0, reserved: 6, oldestOrder: "2026-10-05" }), e({ key: "b", label: "Bolsas", base: 0, min: 10 })]);
  it("crea una por artículo que falta", () => {
    const p = planTasks(lines, [], today);
    expect(p.create.map((c) => [c.key, c.title, c.missing])).toEqual([["a", "Reponer: Camiseta negra M, faltan 6", 6], ["b", "Reponer: Bolsas, faltan 10", 10]]);
  });
  it("actualiza si cambia la cantidad, completa lo repuesto y cierra duplicados", () => {
    const p = planTasks(lines, [
      { id: "1", stock_key: "a", stock_missing: 4, title: "Reponer: Camiseta negra M, faltan 4", due_date: "2026-10-08" },
      { id: "2", stock_key: "a", stock_missing: 6, title: "x", due_date: null },
      { id: "3", stock_key: "gone", stock_missing: 1, title: "x", due_date: null },
    ], today);
    expect(p.update).toEqual([{ id: "1", title: "Reponer: Camiseta negra M, faltan 6", missing: 6, due: "2026-10-08" }]);
    expect(p.complete.map((c) => c.id)).toEqual(["2", "3"]);
    expect(p.create.map((c) => c.key)).toEqual(["b"]);
  });
  it("sin cambios no toca nada", () => {
    const first = planTasks(lines, [], today);
    const open = first.create.map((c, i) => ({ id: String(i), stock_key: c.key, stock_missing: c.missing, title: c.title, due_date: c.due }));
    expect(planTasks(lines, open, today)).toEqual({ create: [], update: [], complete: [] });
  });
});

describe("reservas de artículos genéricos", () => {
  const item = { id: "i", name: "Camiseta negra", variant: "M", product_id: null, match_color: null, match_size: "M" };
  const line = (p: Partial<{ product_id: string | null; product_name: string; color: string | null; size: string | null; quantity: number; order_date: string }>) =>
    ({ product_id: null, product_name: "Camiseta Negra", color: null, size: "m", quantity: 1, order_date: "2026-10-01", ...p });
  it("por nombre sin acentos ni mayúsculas y con la talla fijada", () => {
    expect(lineMatches(item, line({}))).toBe(true);
    expect(lineMatches(item, line({ size: "L" }))).toBe(false);
    expect(lineMatches(item, line({ product_name: "Sudadera" }))).toBe(false);
  });
  it("por producto del catálogo aunque el nombre cambie", () => {
    expect(lineMatches({ ...item, product_id: "p1" }, line({ product_id: "p1", product_name: "Otro nombre" }))).toBe(true);
  });
  it("suma cantidades y guarda el pedido más antiguo", () => {
    expect(reserveGeneric(item, [line({ quantity: 2, order_date: "2026-10-03" }), line({ quantity: 3 }), line({ size: "S", quantity: 9 })])).toEqual({ reserved: 5, oldestOrder: "2026-10-01" });
  });
});

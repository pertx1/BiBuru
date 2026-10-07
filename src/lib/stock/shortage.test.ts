import { describe, expect, it } from "vitest";
import { lineMatches, planTasks, reserveGeneric, shortages, taskNotes, taskTitle, withMissing, type StockEntry, type StockTask } from "./shortage";

const e = (p: Partial<StockEntry>): StockEntry => ({ key: "k", group: "articulos", label: "Camiseta negra M", base: 0, min: 0, reserved: 0, oldestOrder: null, ...p });

describe("qué hay que pedir (como «Pedir ya» y BATU)", () => {
  it("a 0 o menos, o bajo el mínimo", () => {
    expect(withMissing(e({ base: 4, reserved: 10 }))).toMatchObject({ available: -6, missing: 6, needed: true });
    expect(withMissing(e({ base: 0 }))).toMatchObject({ available: 0, missing: 0, needed: true }); // se ha quedado a 0
    expect(withMissing(e({ base: 4, reserved: 1, min: 5 }))).toMatchObject({ available: 3, missing: 2, needed: true });
    expect(withMissing(e({ base: 10, reserved: 2, min: 5 }))).toMatchObject({ available: 8, needed: false });
    expect(withMissing(e({ base: 1 }))).toMatchObject({ needed: false });
  });
  it("lo más negativo primero", () => {
    expect(shortages([e({ key: "cero", base: 0 }), e({ key: "neg", base: 0, reserved: 3 }), e({ key: "ok", base: 2 })]).map((x) => x.key)).toEqual(["neg", "cero"]);
  });
  it("título fijo y nota con la cantidad", () => {
    expect(taskTitle({ label: "Camiseta negra M" })).toBe("Pedir Camiseta negra M");
    expect(taskNotes(withMissing(e({ base: 1, reserved: 7 })))).toMatch(/^Faltan 6 para cubrir los pedidos pendientes\./);
    expect(taskNotes(withMissing(e({ base: 0 })))).toMatch(/^Se ha quedado a 0\./);
    expect(taskNotes(withMissing(e({ base: 2, min: 5 })))).toMatch(/^Quedan 2 y el mínimo es 5\. Para llegar al mínimo \(5\) pide 3\./);
  });
});

describe("tareas «Pedir …» (mismas reglas que BATU con Profity)", () => {
  const lines = shortages([e({ key: "a", base: 0, reserved: 6 }), e({ key: "b", label: "Bolsas", base: 0 })]);
  const t = (p: Partial<StockTask>): StockTask => ({ id: "1", stock_key: "a", stock_missing: 6, notes: taskNotes(lines[0]), status: "open", ...p });
  it("crea una por artículo que falta", () => {
    expect(planTasks(lines, []).create.map((c) => [c.key, c.title, c.missing])).toEqual([["a", "Pedir Camiseta negra M", 6], ["b", "Pedir Bolsas", 0]]);
  });
  it("si cambia la cantidad, actualiza la nota de la abierta", () => {
    const p = planTasks(lines, [t({ stock_missing: 4, notes: "vieja" })]);
    expect(p.update).toEqual([{ id: "1", notes: taskNotes(lines[0]), missing: 6 }]);
    expect(p.create.map((c) => c.key)).toEqual(["b"]);
  });
  it("si la tachaste y sigue faltando, no vuelve a salir", () => {
    const p = planTasks(lines, [t({ status: "done" })]);
    expect(p.create.map((c) => c.key)).toEqual(["b"]);
    expect(p.update).toEqual([]);
    expect(p.release).toEqual([]);
  });
  it("con stock: se suelta la clave y la pendiente se completa sola", () => {
    const p = planTasks([], [t({}), t({ id: "2", status: "done" })]);
    expect(p.release).toEqual([{ id: "1", key: "a", complete: true }, { id: "2", key: "a", complete: false }]);
  });
  it("sin cambios no toca nada", () => {
    const open = planTasks(lines, []).create.map((c, i) => ({ id: String(i), stock_key: c.key, stock_missing: c.missing, notes: c.notes, status: "open" }));
    expect(planTasks(lines, open)).toEqual({ create: [], update: [], release: [] });
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

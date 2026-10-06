import { describe, expect, it } from "vitest";
import { buildPlan, expectedTotals } from "./profity-import";
import { parseProfityJson } from "./profity-json";

const sample = {
  exportadoEl: "2026-10-06T10:01:27.161Z",
  usuario: { email: "yo@x.com", name: "Akerra" },
  pedidos: [
    { id: "o1", orderNumber: "1001", date: "2026-06-03T12:00:00.000Z", quantity: 1, model: "GAZTELUGATXE", color: "BLANCO", size: "S", price: 20.49, status: "ENVIADO" },
    { id: "o2", orderNumber: "1002", date: "2026-06-04T00:00:00.000Z", quantity: 2, model: "OMAKO BASOA", color: "NEGRO", size: "M", price: 43.98, status: "SIN_HACER" },
  ],
  gastos: [
    { id: "g1", date: "2026-06-03T00:00:00.000Z", category: "Muestras", concept: "Camisetas", amount: 32, paymentMethod: "Efectivo" },
    { id: "g2", date: "2026-09-21T00:00:00.000Z", category: "Vinted", concept: "Envío", amount: 3.5, paymentMethod: null },
  ],
  ingresos: [{ id: "i1", date: "2026-09-21T00:00:00.000Z", source: "Vinted", concept: "Funko NBA", amount: 5, method: null }],
  vinted: [{ id: "v1", type: "VENTA", name: "Funko NBA", price: 5 }],
  facturas: [{ id: "f1", name: "8 Metros DTF", url: "https://drive.google.com/x" }],
  stock: { camisetas: [{ modelo: "BLANCA", talla: "S", base: 3, actual: 2 }], dtf: [{ diseno: "BA Azul", variante: "UNICO", base: 5, actual: 4 }] },
  ajustes: { reglasColorCamiseta: [], reglasDiseno: [] },
  bolsaImprentaMarcada: [],
};

describe("parseProfityJson", () => {
  it("convierte la exportación y los totales cuadran con el archivo", () => {
    const r = parseProfityJson(JSON.stringify(sample));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.email).toBe("yo@x.com");
    const t = expectedTotals(buildPlan(r.data.source, { separateVinted: true }));
    expect(t.orders).toEqual({ count: 2, totalCents: 6447 });
    expect(t.expenses).toEqual({ count: 2, totalCents: 3550 });
    expect(t.incomes).toEqual({ count: 1, totalCents: 500 });
    expect(t.tshirtStocks.totalCents).toBe(3); // se importa la base, no lo «actual»
    expect(t.dtfStocks.totalCents).toBe(5);
    expect(t.invoices.count).toBe(1);
  });
  it("explica los errores", () => {
    expect(parseProfityJson("no json")).toEqual({ ok: false, error: "El archivo no es un JSON válido." });
    expect(parseProfityJson("{}")).toMatchObject({ ok: false, error: expect.stringContaining("PROFITY") });
    const bad = { ...sample, gastos: [{ ...sample.gastos[0], amount: "mucho" }] };
    expect(parseProfityJson(JSON.stringify(bad))).toMatchObject({ ok: false, error: expect.stringContaining("gastos → 0 → amount") });
  });
});

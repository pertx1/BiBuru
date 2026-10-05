import { describe, expect, it } from "vitest";
import { csvCell, expensesToCsv, ordersToCsv, toCsv } from "./csv";

describe("CSV", () => {
  it("escapa comillas, separadores y saltos de línea", () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('di "hola"')).toBe('"di ""hola"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(null)).toBe("");
  });
  it("neutraliza fórmulas de Excel", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+34600")).toBe("'+34600");
    expect(csvCell(-5)).toBe("-5"); // los números no se tocan
  });
  it("lleva BOM y separador ;", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("﻿a;b\r\n1;x\r\n");
  });
  it("pedidos: una fila por línea con importes en coma decimal", () => {
    const csv = ordersToCsv([{ order_date: "2026-03-05", order_number: "12", customer: "Ana", channel: null, status: "enviado", total_cents: 5000, cost_cents: 1800,
      order_items: [{ product_name: "Camiseta", color: "Negra", size: "M", quantity: 2, unit_price_cents: 2500, unit_cost_cents: 900 }] }]);
    expect(csv.split("\r\n")[1]).toBe("05/03/2026;12;Ana;;enviado;Camiseta;Negra;M;2;25,00;9,00;50,00;50,00");
  });
  it("gastos", () => {
    const csv = expensesToCsv([{ expense_date: "2026-03-05", concept: "Cinta", amount_cents: 1250, supplier: null, payment_method: "Tarjeta", recurrence: null, expense_categories: { name: "Envíos" } }]);
    expect(csv.split("\r\n")[1]).toBe("05/03/2026;Cinta;Envíos;12,50;;Tarjeta;");
  });
});

import { describe, expect, it } from "vitest";
import { formatDecimal, formatEUR, lineTotal, marginPct, orderTotals, splitCents, toCents, variationPct } from "./money";

describe("toCents", () => {
  it.each([
    ["12", 1200], ["12,5", 1250], ["12.50", 1250], ["1.234,56", 123456], ["1,234.56", 123456],
    ["€ 12,99", 1299], ["0,07", 7], ["-3,2", -320], ["1.234", 123400], ["0,005", 1], ["1,5", 150],
  ])("%s -> %i", (input, expected) => expect(toCents(input)).toBe(expected));
  it("rechaza lo que no es un importe", () => {
    for (const bad of ["", "abc", "12,3,4x", "--5", null, undefined, NaN, Infinity]) {
      expect(toCents(bad as never)).toBeNull();
    }
  });
  it("redondea floats sin errores de coma flotante", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1.005)).toBe(101);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(4.35)).toBe(435);
  });
});

describe("formato", () => {
  it("formatea en euros de España", () => {
    // es-ES no agrupa miles en números de 4 cifras (norma RAE).
    expect(formatEUR(123456).replace(/\s/g, " ")).toBe("1234,56 €");
    expect(formatEUR(1234567).replace(/\s/g, " ")).toBe("12.345,67 €");
    expect(formatEUR(5).replace(/\s/g, " ")).toBe("0,05 €");
  });
  it("decimal sin separador de miles", () => {
    expect(formatDecimal(123456)).toBe("1234,56");
  });
});

describe("cálculos de pedido", () => {
  it("total, coste y beneficio", () => {
    const lines = [
      { quantity: 2, unitPriceCents: 2500, unitCostCents: 900 },
      { quantity: 1, unitPriceCents: 4000, unitCostCents: 1500 },
    ];
    expect(lineTotal(lines[0])).toBe(5000);
    expect(orderTotals(lines)).toEqual({ totalCents: 9000, costCents: 3300, profitCents: 5700 });
  });
  it("sin líneas todo es 0", () => {
    expect(orderTotals([])).toEqual({ totalCents: 0, costCents: 0, profitCents: 0 });
  });
});

describe("margen y variación", () => {
  it("margen", () => {
    expect(marginPct(2500, 10000)).toBe(25);
    expect(marginPct(1, 3)).toBe(33.3);
    expect(marginPct(100, 0)).toBeNull();
  });
  it("variación", () => {
    expect(variationPct(150, 100)).toBe(50);
    expect(variationPct(50, 100)).toBe(-50);
    expect(variationPct(10, 0)).toBeNull();
    expect(variationPct(-50, -100)).toBe(50);
  });
  it("reparto sin perder céntimos", () => {
    expect(splitCents(100, 3)).toEqual([34, 33, 33]);
    expect(splitCents(100, 3).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

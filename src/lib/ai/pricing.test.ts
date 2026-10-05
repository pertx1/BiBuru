import { describe, expect, it } from "vitest";
import { BLOCKED_MESSAGE, budgetState, canSpend, costMicros, estimateVideoCostMicros, eurosToMicros, microsToEuros, monthBounds } from "./pricing";

describe("coste de IA", () => {
  it("tokens × precio por millón = micro-euros", () => {
    expect(costMicros(1_000_000, 0, { input: 0.25, output: 1.5 })).toBe(250_000);        // 0,25 €
    expect(costMicros(2000, 500, { input: 0.25, output: 1.5 })).toBe(1250);             // 0,00125 €
    expect(costMicros(0, 0, { input: 1, output: 1 })).toBe(0);
  });
  it("redondea hacia arriba (nunca subestima)", () => {
    expect(costMicros(1, 0, { input: 0.25, output: 0 })).toBe(1);
  });
  it("conversión a euros", () => {
    expect(microsToEuros(1_500_000)).toBe(1.5);
    expect(eurosToMicros(0.0123)).toBe(12300);
  });
  it("estimación de un vídeo largo", () => {
    const m = estimateVideoCostMicros(3600, { input: 0.6, output: 3.5 });
    expect(microsToEuros(m)).toBeGreaterThan(0.5);   // 1 h de vídeo ≈ 1,08M tokens
    expect(microsToEuros(m)).toBeLessThan(1.2);
  });
});

describe("presupuesto mensual", () => {
  it("niveles: ok, aviso al 80 %, bloqueo al 100 %", () => {
    expect(budgetState(0, 1000).level).toBe("ok");
    expect(budgetState(7_990_000, 1000).level).toBe("ok");
    expect(budgetState(8_000_000, 1000)).toMatchObject({ level: "warn", pct: 80 });
    expect(budgetState(9_999_999, 1000).level).toBe("warn");
    expect(budgetState(10_000_000, 1000)).toMatchObject({ level: "blocked", remainingMicros: 0 });
    expect(budgetState(12_000_000, 1000).pct).toBe(120);
  });
  it("presupuesto 0 bloquea siempre", () => {
    expect(budgetState(0, 0).level).toBe("blocked");
  });
  it("no deja gastar más de lo que queda con una llamada cara", () => {
    const s = budgetState(9_000_000, 1000); // quedan 1 €
    expect(canSpend(s)).toEqual({ ok: true });
    expect(canSpend(s, 500_000)).toEqual({ ok: true });
    expect(canSpend(s, 1_500_000)).toEqual({ ok: false, reason: "would_exceed" });
    expect(canSpend(budgetState(10_000_000, 1000))).toEqual({ ok: false, reason: "blocked" });
  });
  it("meses naturales", () => {
    expect(monthBounds("2026-10-17")).toEqual({ key: "2026-10", from: "2026-10-01", to: "2026-11-01" });
    expect(monthBounds("2026-12-31")).toEqual({ key: "2026-12", from: "2026-12-01", to: "2027-01-01" });
  });
  it("mensaje claro cuando se bloquea", () => {
    expect(BLOCKED_MESSAGE).toContain("captura sigue funcionando");
  });
});

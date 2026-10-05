import { describe, expect, it } from "vitest";
import {
  addDays, addMonths, diffDays, endOfMonth, formatDate, isValidISO, nowLocal, parseDateInput, previousPeriod,
  resolvePeriod, startOfMonth, startOfWeek, todayISO, zonedToUtc,
} from "./dates";

describe("fechas", () => {
  it("formato dd/mm/aaaa", () => expect(formatDate("2026-03-05")).toBe("05/03/2026"));
  it("valida fechas reales", () => {
    expect(isValidISO("2026-02-29")).toBe(false);
    expect(isValidISO("2028-02-29")).toBe(true);
    expect(isValidISO("2026-13-01")).toBe(false);
  });
  it("lee fechas escritas a mano", () => {
    expect(parseDateInput("5/3/26")).toBe("2026-03-05");
    expect(parseDateInput("05-03-2026")).toBe("2026-03-05");
    expect(parseDateInput("2026-03-05")).toBe("2026-03-05");
    expect(parseDateInput("31/02/2026")).toBeNull();
    expect(parseDateInput("hola")).toBeNull();
  });
  it("hoy se calcula en Europe/Madrid", () => {
    // 23:30 UTC del 30 mar 2026 (ya es 31 en Madrid, UTC+2 tras el cambio de hora).
    expect(todayISO(new Date("2026-03-30T23:30:00Z"))).toBe("2026-03-31");
    expect(todayISO(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-16");
    expect(todayISO(new Date("2026-01-15T23:30:00Z"), "UTC")).toBe("2026-01-15");
  });
  it("suma días atravesando el cambio de hora sin desfase", () => {
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(diffDays("2026-03-28", "2026-03-30")).toBe(2);
  });
  it("suma meses sin desbordar", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
  it("inicio y fin de mes; semana desde lunes", () => {
    expect(startOfMonth("2026-02-17")).toBe("2026-02-01");
    expect(endOfMonth("2028-02-17")).toBe("2028-02-29");
    expect(startOfWeek("2026-10-04")).toBe("2026-09-28"); // domingo -> lunes anterior
    expect(startOfWeek("2026-10-05")).toBe("2026-10-05"); // lunes
  });
});

describe("periodos", () => {
  const today = "2026-10-05";
  it("presets", () => {
    expect(resolvePeriod("this_month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolvePeriod("last_month", today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(resolvePeriod("last_3_months", today)).toEqual({ from: "2026-08-01", to: "2026-10-31" });
    expect(resolvePeriod("last_30", today)).toEqual({ from: "2026-09-06", to: "2026-10-05" });
    expect(resolvePeriod("last_year", today)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });
  it("custom inválido cae a este mes", () => {
    expect(resolvePeriod("custom", today, { from: "2026-10-09", to: "2026-10-01" })).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
  it("periodo anterior de meses completos", () => {
    expect(previousPeriod({ from: "2026-10-01", to: "2026-10-31" })).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(previousPeriod({ from: "2026-08-01", to: "2026-10-31" })).toEqual({ from: "2026-05-01", to: "2026-07-31" });
    expect(previousPeriod({ from: "2026-01-01", to: "2026-12-31" })).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(previousPeriod({ from: "2026-03-01", to: "2026-03-31" })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("periodo anterior de días sueltos", () => {
    expect(previousPeriod({ from: "2026-09-06", to: "2026-10-05" })).toEqual({ from: "2026-08-07", to: "2026-09-05" });
  });
});

describe("hora local <-> UTC (Europe/Madrid)", () => {
  it("invierno (UTC+1) y verano (UTC+2)", () => {
    expect(zonedToUtc("2026-01-15", "10:00").toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(zonedToUtc("2026-07-15", "10:00").toISOString()).toBe("2026-07-15T08:00:00.000Z");
  });
  it("cambio de hora de primavera (29/03/2026: 02:00 -> 03:00)", () => {
    expect(zonedToUtc("2026-03-29", "01:30").toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(zonedToUtc("2026-03-29", "03:30").toISOString()).toBe("2026-03-29T01:30:00.000Z");
    // 02:30 no existe: se lleva a una hora válida cercana (03:30 local)
    expect(nowLocal(zonedToUtc("2026-03-29", "02:30")).time).toBe("03:30");
  });
  it("cambio de hora de otoño (25/10/2026: 03:00 -> 02:00): la hora repetida usa la primera", () => {
    expect(zonedToUtc("2026-10-25", "02:30").toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(zonedToUtc("2026-10-25", "04:00").toISOString()).toBe("2026-10-25T03:00:00.000Z");
  });
  it("va y vuelve sin perder la hora", () => {
    for (const [d, t] of [["2026-06-01", "23:59"], ["2026-12-31", "00:00"], ["2026-10-05", "09:05"]]) {
      expect(nowLocal(zonedToUtc(d, t))).toEqual({ date: d, time: t });
    }
  });
  it("otras zonas", () => {
    expect(zonedToUtc("2026-07-15", "10:00", "America/New_York").toISOString()).toBe("2026-07-15T14:00:00.000Z");
  });
});

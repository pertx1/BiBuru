import { describe, expect, it } from "vitest";
import { dow, isDue, periodLabel, reviewPeriod, reviewPushKey, type ReviewPrefs } from "./period";

const prefs: ReviewPrefs = {
  review_daily_enabled: true, review_daily_time: "08:30:00",
  review_weekly_enabled: true, review_weekly_dow: 6, review_weekly_time: "18:00:00",
  review_monthly_enabled: true, review_monthly_time: "09:00:00",
};

describe("periodo de cada revisión", () => {
  it("diaria: hoy, comparando con ayer, y eventos de hoy y mañana", () => {
    expect(reviewPeriod("diaria", "2026-10-07")).toEqual({ kind: "diaria", start: "2026-10-07", end: "2026-10-07", previous: { from: "2026-10-06", to: "2026-10-06" }, ahead: { from: "2026-10-07", to: "2026-10-08" } });
  });
  it("semanal el domingo: la semana actual (lunes a domingo) y la que viene", () => {
    expect(dow("2026-10-11")).toBe(6);
    expect(reviewPeriod("semanal", "2026-10-11")).toMatchObject({ start: "2026-10-05", end: "2026-10-11", previous: { from: "2026-09-28", to: "2026-10-04" }, ahead: { from: "2026-10-12", to: "2026-10-18" } });
  });
  it("semanal el lunes: la semana anterior", () => {
    expect(reviewPeriod("semanal", "2026-10-12")).toMatchObject({ start: "2026-10-05", end: "2026-10-11" });
  });
  it("mensual el día 1: el mes anterior completo; los eventos, del que empieza", () => {
    expect(reviewPeriod("mensual", "2026-11-01")).toEqual({ kind: "mensual", start: "2026-10-01", end: "2026-10-31", previous: { from: "2026-09-01", to: "2026-09-30" }, ahead: { from: "2026-11-01", to: "2026-11-30" } });
    expect(reviewPeriod("mensual", "2026-03-01")).toMatchObject({ start: "2026-02-01", end: "2026-02-28", previous: { from: "2026-01-01", to: "2026-01-31" } });
  });
});

describe("cuándo toca", () => {
  it("diaria desde su hora y el resto del día", () => {
    expect(isDue("diaria", prefs, { date: "2026-10-07", time: "08:29" })).toBe(false);
    expect(isDue("diaria", prefs, { date: "2026-10-07", time: "08:30" })).toBe(true);
    expect(isDue("diaria", prefs, { date: "2026-10-07", time: "22:00" })).toBe(true);
    expect(isDue("diaria", { ...prefs, review_daily_enabled: false }, { date: "2026-10-07", time: "09:00" })).toBe(false);
  });
  it("semanal solo el día elegido (por defecto domingo por la tarde)", () => {
    expect(isDue("semanal", prefs, { date: "2026-10-11", time: "18:00" })).toBe(true);
    expect(isDue("semanal", prefs, { date: "2026-10-11", time: "17:59" })).toBe(false);
    expect(isDue("semanal", prefs, { date: "2026-10-10", time: "19:00" })).toBe(false);
  });
  it("mensual el día 1 a su hora (o los días 2 y 3 si se pasó)", () => {
    expect(isDue("mensual", prefs, { date: "2026-11-01", time: "08:59" })).toBe(false);
    expect(isDue("mensual", prefs, { date: "2026-11-01", time: "09:00" })).toBe(true);
    expect(isDue("mensual", prefs, { date: "2026-11-02", time: "00:10" })).toBe(true);
    expect(isDue("mensual", prefs, { date: "2026-11-04", time: "10:00" })).toBe(false);
  });
  it("una clave de aviso por revisión y textos del periodo", () => {
    expect(reviewPushKey("semanal", "2026-10-05")).toBe("review:semanal:2026-10-05");
    expect(periodLabel(reviewPeriod("semanal", "2026-10-11"))).toBe("semana del 5 al 11 de octubre");
    expect(periodLabel(reviewPeriod("semanal", "2026-10-04"))).toBe("semana del 28 de septiembre al 4 de octubre");
    expect(periodLabel(reviewPeriod("mensual", "2026-11-01"))).toBe("octubre de 2026");
    expect(periodLabel(reviewPeriod("diaria", "2026-10-07"))).toBe("7 de octubre");
  });
});

import { describe, expect, it } from "vitest";
import { formatGoalValue, pace, parseFixed, progressPct } from "./goals";

const base = { measure_type: "number" as const, target_value: 10000, current_value: 2500, auto_source: null };

describe("progreso de objetivos", () => {
  it("manual: valor / objetivo", () => {
    expect(progressPct(base, {})).toMatchObject({ pct: 25, reached: false });
  });
  it("se acota a 100 pero indica que se alcanzó", () => {
    expect(progressPct({ ...base, current_value: 15000 }, {})).toMatchObject({ pct: 100, reached: true, value: 15000 });
  });
  it("sin objetivo no divide por cero", () => {
    expect(progressPct({ ...base, target_value: 0 }, {})).toMatchObject({ pct: 0, reached: false });
  });
  it("euros ligados a ingresos del periodo", () => {
    const g = { measure_type: "euros" as const, target_value: 500000, current_value: 0, auto_source: "income" as const };
    expect(progressPct(g, { metricCents: 125000 })).toMatchObject({ pct: 25, value: 125000 });
  });
  it("beneficio negativo no da porcentaje negativo", () => {
    const g = { measure_type: "euros" as const, target_value: 100000, current_value: 0, auto_source: "profit" as const };
    expect(progressPct(g, { metricCents: -5000 }).pct).toBe(0);
  });
  it("tareas vinculadas completadas (porcentaje)", () => {
    const g = { measure_type: "percent" as const, target_value: 10000, current_value: 0, auto_source: "tasks" as const };
    expect(progressPct(g, { tasksDone: 3, tasksTotal: 4 })).toMatchObject({ pct: 75 });
    expect(progressPct(g, { tasksDone: 0, tasksTotal: 0 }).pct).toBe(0);
  });
  it("hitos", () => {
    const g = { measure_type: "milestones" as const, target_value: 0, current_value: 0, auto_source: null };
    expect(progressPct(g, { milestonesDone: 1, milestonesTotal: 3 })).toMatchObject({ pct: 33.3 });
    expect(progressPct(g, { milestonesDone: 3, milestonesTotal: 3 })).toMatchObject({ pct: 100, reached: true });
  });
  it("formato", () => {
    expect(formatGoalValue("euros", 123456).replace(/\s/g, " ")).toBe("1234,56 €");
    expect(formatGoalValue("percent", 7550)).toBe("75,5 %");
    expect(formatGoalValue("number", 1250)).toBe("12,5");
    expect(parseFixed("1.500,5")).toBe(150050);
  });
  it("ritmo", () => {
    expect(pace(10, "2026-01-01", "2026-12-31", "2026-07-01")).toBe("behind");
    expect(pace(50, "2026-01-01", "2026-12-31", "2026-07-01")).toBe("ontrack");
    expect(pace(80, "2026-01-01", "2026-12-31", "2026-07-01")).toBe("ahead");
    expect(pace(100, "2026-01-01", "2026-12-31", "2026-07-01")).toBeNull();
    expect(pace(10, null, null, "2026-07-01")).toBeNull();
  });
});

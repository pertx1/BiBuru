import { describe, expect, it } from "vitest";
import { chartStart, pickTotals, shortEuros } from "./finance";
import { DEFAULT_LAYOUT, cleanSettings, layoutSchema, newInstance, normalizeLayout, WIDGET_BY_TYPE } from "./layout";
import { DEFAULT_TABS, moreSections, normalizeTabs, splitTabs } from "./nav";
import { homeRange, pairSeries } from "./period";

describe("disposición de Inicio", () => {
  it("sin guardar = la de por defecto, con el Resumen financiero el primero", () => {
    const l = normalizeLayout(null);
    expect(l[0]).toMatchObject({ type: "finance-summary", size: "l", settings: { business: "all", months: "6" } });
    expect(l).toEqual(DEFAULT_LAYOUT);
    l[0].settings.months = "12";
    expect(DEFAULT_LAYOUT[0].settings.months).toBe("6"); // devuelve copias, no la constante
  });
  it("guardar y volver a cargar conserva orden, tamaños y ajustes", () => {
    const saved = [
      { id: "aaaa-1", type: "sales", size: "s", settings: { business: "11111111-1111-1111-1111-111111111111" } },
      { id: "aaaa-2", type: "finance-summary", size: "l", settings: { business: "all", months: "12" } },
    ];
    const roundTrip = normalizeLayout(JSON.parse(JSON.stringify(layoutSchema.parse(saved))));
    expect(roundTrip).toEqual(saved);
  });
  it("descarta lo inválido sin perder lo bueno", () => {
    const l = normalizeLayout([
      { id: "ok-1", type: "sales", size: "m", settings: {} },
      { id: "ok-1", type: "profit", size: "m", settings: {} },          // id repetido
      { id: "x-2", type: "no-existe", size: "m", settings: {} },         // tipo desconocido
      { id: "xx-3", type: "finance-summary", size: "s", settings: { months: "99", business: "<script>" } }, // tamaño y ajustes fuera de rango
      "basura", null, { id: "!!", type: "sales", size: "m" },
    ]);
    expect(l.map((w) => w.id)).toEqual(["ok-1", "xx-3"]);
    expect(l[0].settings).toEqual({ business: "all" });
    expect(l[1]).toMatchObject({ size: "l", settings: { business: "all", months: "6" } });
  });
  it("algo que no es una lista vuelve a la de por defecto", () => {
    expect(normalizeLayout({ a: 1 })).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout([])).toEqual([]); // vacía a propósito: se respeta
  });
  it("ajustes y nuevas instancias", () => {
    const meta = WIDGET_BY_TYPE.get("finance-summary")!;
    expect(cleanSettings(meta, { months: "3", extra: "x" })).toEqual({ business: "all", months: "3" });
    expect(newInstance("sales", "abcd-1234")).toEqual({ id: "abcd-1234", type: "sales", size: "m", settings: { business: "all" } });
    expect(newInstance("nope", "abcd")).toBeNull();
  });
  it("el esquema rechaza listas demasiado largas", () => {
    expect(layoutSchema.safeParse(Array.from({ length: 41 }, (_, i) => ({ id: `id-${i}xx`, type: "sales", size: "m", settings: {} }))).success).toBe(false);
  });
});

describe("barra inferior", () => {
  it("normaliza: válidas, sin repetir, máximo 4; vacía = por defecto", () => {
    expect(normalizeTabs(null)).toEqual(DEFAULT_TABS);
    expect(normalizeTabs([])).toEqual(DEFAULT_TABS);
    expect(normalizeTabs(["notas", "notas", "hack", "tareas", "chat", "objetivos", "favoritos"])).toEqual(["notas", "tareas", "chat", "objetivos"]);
  });
  it("«Más» lleva lo que no está en la barra y siempre Ajustes", () => {
    const more = moreSections(["tareas", "negocios"]).map((s) => s.key);
    expect(more).toContain("inicio");
    expect(more).toContain("ajustes");
    expect(more).not.toContain("tareas");
    expect(moreSections(["ajustes"]).map((s) => s.key)).toContain("ajustes");
  });
  it("reparte alrededor del botón central como la barra original", () => {
    expect(splitTabs(["Inicio", "Tareas", "Negocios", "Más"])).toEqual({ left: ["Inicio", "Tareas"], right: ["Negocios", "Más"] });
    expect(splitTabs(["a", "b", "c", "d", "Más"])).toEqual({ left: ["a", "b"], right: ["c", "d", "Más"] });
  });
});

describe("periodos de Inicio", () => {
  it("7 y 30 días frente a los anteriores", () => {
    expect(homeRange("7d", "2026-10-06")).toEqual({ current: { from: "2026-09-30", to: "2026-10-06" }, previous: { from: "2026-09-23", to: "2026-09-29" }, granularity: "day" });
    expect(homeRange("hoy", "2026-10-06").previous).toEqual({ from: "2026-10-05", to: "2026-10-05" });
  });
  it("este mes hasta hoy frente al mismo tramo del anterior (sin pasarse de fin de mes)", () => {
    expect(homeRange("mes", "2026-10-06")).toMatchObject({ current: { from: "2026-10-01", to: "2026-10-06" }, previous: { from: "2026-09-01", to: "2026-09-06" } });
    expect(homeRange("mes", "2026-03-31").previous).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("este año por meses; 29 de febrero contra 28", () => {
    expect(homeRange("ano", "2028-02-29")).toEqual({ current: { from: "2028-01-01", to: "2028-02-29" }, previous: { from: "2027-01-01", to: "2027-02-28" }, granularity: "month" });
  });
  it("empareja día a día y deja null si el anterior es más corto", () => {
    const p = pairSeries([{ key: "2026-10-01", income: 100, expense: 30 }, { key: "2026-10-02", income: 50, expense: 0 }], [{ key: "2026-09-01", income: 10, expense: 5 }], (x) => x.income - x.expense);
    expect(p).toEqual([
      { label: "2026-10-01", date: "2026-10-01", prevDate: "2026-09-01", current: 70, previous: 5 },
      { label: "2026-10-02", date: "2026-10-02", prevDate: null, current: 50, previous: null },
    ]);
  });
});

describe("Resumen financiero", () => {
  const byBiz = new Map([
    ["a", { income: 18586, expense: 5000, profit: 13586, orders: 3 }],
    ["b", { income: 1000, expense: 2500, profit: -1500, orders: 1 }],
  ]);
  it("suma todos los negocios o uno", () => {
    expect(pickTotals(byBiz)).toEqual({ income: 19586, expense: 7500, profit: 12086, orders: 4 });
    expect(pickTotals(byBiz, "b")).toEqual({ income: 1000, expense: 2500, profit: -1500, orders: 1 });
    expect(pickTotals(byBiz, "nada")).toEqual({ income: 0, expense: 0, profit: 0, orders: 0 });
  });
  it("eje Y abreviado y mes de inicio del gráfico", () => {
    expect([450, 900, 1400, 1800, 2_500_000].map(shortEuros)).toEqual(["450", "900", "1,4K", "1,8K", "2,5M"]);
    expect(chartStart("2026-10-06", 6)).toBe("2026-05-01");
    expect(chartStart("2026-02-15", 3)).toBe("2025-12-01");
    expect(chartStart("2026-10-31", 12)).toBe("2025-11-01");
  });
});

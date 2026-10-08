import { describe, expect, it } from "vitest";
import { chartStart, pickTotals, shortEuros } from "./finance";
import { BUSINESS_WIDGETS, DEFAULT_LAYOUT, cleanSettings, defaultBusinessLayout, layoutSchema, newInstance, normalizeBusinessLayout, normalizeLayout, seedLayout, WIDGET_BY_TYPE, withBusiness } from "./layout";
import { DEFAULT_TABS, maxTabs, moreSections, normalizeTabs, splitTabs } from "./nav";
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
  it("normaliza: válidas, sin repetir, máximo 5 (4 con el botón +); vacía = por defecto", () => {
    expect(normalizeTabs(null)).toEqual(DEFAULT_TABS);
    expect(normalizeTabs([])).toEqual(DEFAULT_TABS);
    const raw = ["notas", "notas", "hack", "tareas", "chat", "objetivos", "favoritos", "bandeja"];
    expect(normalizeTabs(raw)).toEqual(["notas", "tareas", "chat", "objetivos", "favoritos"]);
    expect(normalizeTabs(raw, maxTabs(true))).toEqual(["notas", "tareas", "chat", "objetivos"]);
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

describe("catálogo completo (tanda 2)", async () => {
  const { readFileSync } = await import("node:fs");
  const { WIDGETS } = await import("./layout");
  const registry = readFileSync("src/components/home/registry.tsx", "utf8");
  it("cada widget del catálogo tiene componente registrado y tamaños coherentes", () => {
    expect(WIDGETS.length).toBeGreaterThanOrEqual(33);
    for (const m of WIDGETS) {
      expect(registry, m.type).toMatch(new RegExp(`["']?${m.type}["']?:\\s*\\w+Widget`));
      expect(m.sizes).toContain(m.defaultSize);
      for (const f of m.fields) expect(m.defaults, `${m.type}.${f.key}`).toHaveProperty(f.key);
    }
    expect(new Set(WIDGETS.map((m) => m.type)).size).toBe(WIDGETS.length);
  });
  it("ajustes de objetivo/carpeta/categoría: id válido o vacío (automático)", () => {
    const ring = WIDGET_BY_TYPE.get("goal-ring")!;
    expect(cleanSettings(ring, {})).toEqual({ goal: "" });
    expect(cleanSettings(ring, { goal: "11111111-1111-1111-1111-111111111111" })).toEqual({ goal: "11111111-1111-1111-1111-111111111111" });
    expect(cleanSettings(ring, { goal: "drop table" })).toEqual({ goal: "" });
    expect(cleanSettings(WIDGET_BY_TYPE.get("tasks-business")!, { business: "all" })).toEqual({ business: "" }); // ese widget exige un negocio
    expect(cleanSettings(WIDGET_BY_TYPE.get("orders")!, {})).toEqual({ business: "all", show: "pending" });
  });
});

describe("widgets fijos añadidos una sola vez («Sin fecha»)", () => {
  const custom = normalizeLayout([{ id: "aaaa", type: "tasks-today", size: "m", settings: {} }, { id: "bbbb", type: "agenda-today", size: "s", settings: {} }]);
  it("la disposición por defecto ya lo trae, justo después de «Tareas de hoy»", () => {
    expect(DEFAULT_LAYOUT.map((w) => w.type).slice(1, 4)).toEqual(["review-today", "tasks-today", "tasks-nodate"]);
  });
  it("en un Inicio personalizado se añade detrás de «Tareas de hoy» y se recuerda", () => {
    const r = seedLayout(custom, [], (t) => `seed-${t}`);
    expect(r.changed).toBe(true);
    expect(r.layout.map((w) => w.type)).toEqual(["review-today", "tasks-today", "tasks-nodate", "agenda-today"]);
    expect(r.seeded).toEqual(expect.arrayContaining(["tasks-nodate", "review-today"]));
  });
  it("si ya se añadió (y luego lo quitaste), no vuelve", () => {
    const r = seedLayout(custom, ["tasks-nodate", "review-today"], (t) => `seed-${t}`);
    expect(r.changed).toBe(false);
    expect(r.layout.map((w) => w.type)).toEqual(["tasks-today", "agenda-today"]);
  });
  it("si no hay «Tareas de hoy», va al principio; si ya estaba, no se duplica", () => {
    expect(seedLayout(normalizeLayout([{ id: "cccc", type: "inbox", size: "s", settings: {} }]), [], (t) => `seed-${t}`).layout.slice(0, 2).map((w) => w.type)).toEqual(["review-today", "tasks-nodate"]);
    const twice = seedLayout([...custom, { id: "dddd", type: "tasks-nodate", size: "m", settings: {} }], [], (t) => `seed-${t}`);
    expect(twice.layout.filter((w) => w.type === "tasks-nodate")).toHaveLength(1);
  });
});

describe("Resumen de cada negocio con widgets", () => {
  const BIZ = "22222222-2222-2222-2222-222222222222";
  it("sin guardar: la disposición por defecto (Bolsa imprenta y Reglas solo con producción)", () => {
    const plain = normalizeBusinessLayout({}, BIZ, false).map((w) => w.type);
    expect(plain[0]).toBe("finance-summary");
    expect(plain).not.toContain("print-bag");
    expect(normalizeBusinessLayout(null, BIZ, true).map((w) => w.type)).toEqual(expect.arrayContaining(["print-bag", "invoices-latest", "antola-rules", "orders-status", "social-inbox"]));
    expect(defaultBusinessLayout(true).every((w) => BUSINESS_WIDGETS.has(w.type))).toBe(true);
  });
  it("cada negocio guarda la suya y solo admite widgets de negocio", () => {
    const saved = { [BIZ]: [{ id: "aaaa", type: "orders-status", size: "s", settings: {} }, { id: "bbbb", type: "news-today", size: "m", settings: {} }] };
    expect(normalizeBusinessLayout(saved, BIZ, false).map((w) => [w.type, w.size])).toEqual([["orders-status", "s"]]);
    expect(normalizeBusinessLayout(saved, "33333333-3333-3333-3333-333333333333", false)[0].type).toBe("finance-summary");
  });
  it("dentro del negocio, los widgets usan ese negocio", () => {
    const w = newInstance("orders", "x-1")!;
    expect(withBusiness(w, BIZ).settings.business).toBe(BIZ);
    expect(withBusiness(newInstance("quick-capture", "x-2")!, BIZ).settings).toEqual({});
  });
  it("los 15 widgets de negocio y los dos de acceso existen en el catálogo (también en Inicio, eligiendo negocio)", () => {
    for (const t of ["finance-summary", "profit", "sales-monthly", "expenses-category", "orders", "orders-status", "pending-receivables", "top-products", "stock-missing",
      "stock-summary", "print-bag", "invoices-latest", "antola-rules", "social-followers", "social-inbox", "tasks-business", "goals-active"]) {
      const m = WIDGET_BY_TYPE.get(t);
      expect(m, t).toBeDefined();
      expect(m!.fields.some((f) => f.kind === "business"), t).toBe(true);
    }
  });
});

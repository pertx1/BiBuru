import { describe, expect, it } from "vitest";
import { buildWidgetScript } from "./script";
import { runInScriptable } from "./scriptable-mock";

const data = {
  tasks: { today: 2, overdue: 1, list: [{ title: "Llamar a la imprenta", time: "10:00", overdue: false }, { title: "Pedir sudaderas", time: null, overdue: false }, { title: "Factura septiembre", time: null, overdue: true }] },
  money: { todayIncome: 4590, monthIncome: 123400, monthProfit: -2500 },
  orders: { toDo: 3 }, receivable: 1500, stockToOrder: 2,
};
const ok = (seen: { url?: string; auth?: string }) => async (url: string, h: Record<string, string>) => { seen.url = url; seen.auth = h.Authorization; return { status: 200, body: data }; };

describe("widget de iPhone (Scriptable)", () => {
  it("lleva la dirección y la clave bien escapadas", () => {
    const s = buildWidgetScript("https://bi-buru.vercel.app", 'bw_ab"c');
    expect(s).toContain('const URL_BASE = "https://bi-buru.vercel.app";');
    expect(s).toContain('const CLAVE = "bw_ab\\"c";');
  });

  it("resumen mediano: pide con la clave y pinta tareas y dinero", async () => {
    const seen: { url?: string; auth?: string } = {};
    const p = await runInScriptable(buildWidgetScript("https://x.app", "bw_k"), { family: "medium", fetchJson: ok(seen) });
    expect(seen).toEqual({ url: "https://x.app/api/widget", auth: "Bearer bw_k" });
    expect(p.widgetSet).toBe(true);
    expect(p.url).toBe("https://x.app/tareas");
    const t = p.texts.join(" | ");
    expect(t).toContain("Hoy · 2 tareas");
    expect(t).toContain("10:00 Llamar a la imprenta");
    expect(t).toContain("Atrasadas");
    expect(t).toMatch(/Ventas hoy \| 45,90\s€/);
    expect(t).toMatch(/Beneficio del mes \| -25\s€/);
    expect(t).toContain("Pedidos sin hacer | 3");
    expect(t).toContain("Te deben");
    expect(t).toContain("Stock a pedir | 2");
  });

  it("parámetros: «tareas» solo tareas; «dinero» solo cifras y abre Negocios", async () => {
    const tareas = (await runInScriptable(buildWidgetScript("https://x.app", "k"), { param: "tareas", fetchJson: ok({}) })).texts.join(" | ");
    expect(tareas).toContain("Tareas de hoy · 2");
    expect(tareas).not.toContain("Ventas");
    const dinero = await runInScriptable(buildWidgetScript("https://x.app", "k"), { param: " Dinero ", family: "small", fetchJson: ok({}) });
    expect(dinero.texts.join(" | ")).toContain("Ventas del mes");
    expect(dinero.texts.join(" | ")).not.toContain("Llamar");
    expect(dinero.url).toBe("https://x.app/negocios");
  });

  it("clave borrada o sin conexión: lo dice en el widget, sin romperse", async () => {
    const bad = await runInScriptable(buildWidgetScript("https://x.app", "k"), { fetchJson: async () => ({ status: 401, body: { error: "Clave no válida" } }) });
    expect(bad.texts).toContain("Clave no válida");
    const off = await runInScriptable(buildWidgetScript("https://x.app", "k"), { fetchJson: async () => { throw new Error("offline"); } });
    expect(off.texts).toContain("Sin conexión");
  });

  it("al abrirlo en Scriptable (no en widget) enseña la vista previa", async () => {
    expect((await runInScriptable(buildWidgetScript("https://x.app", "k"), { inWidget: false, fetchJson: ok({}) })).presented).toBe(true);
  });
});

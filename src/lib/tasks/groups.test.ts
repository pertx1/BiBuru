import { describe, expect, it } from "vitest";
import { groupTasks } from "./groups";
import type { TaskWithSubs } from "./data";

const t = (id: string, due: string | null, biz: string | null = null): TaskWithSubs =>
  ({ id, due_date: due, business_id: biz, status: "open", subtasks: [] } as unknown as TaskWithSubs);
const today = "2026-10-05";

describe("agrupar tareas por vista", () => {
  it("Hoy: las atrasadas van aparte, marcadas como atrasadas", () => {
    const g = groupTasks("hoy", [t("a", "2026-10-01"), t("b", "2026-10-05")], today, new Map());
    expect(g[0]).toMatchObject({ title: "Atrasadas", tone: "danger" });
    expect(g[0].tasks.map((x) => x.id)).toEqual(["a"]);
    expect(g[1].tasks.map((x) => x.id)).toEqual(["b"]);
  });
  it("7 días: un grupo por día, hoy primero", () => {
    const g = groupTasks("7dias", [t("a", "2026-10-06"), t("b", "2026-10-05")], today, new Map());
    expect(g).toHaveLength(7);
    expect(g[0].title).toBe("Hoy");
    expect(g[1].title).toBe("Mañana");
    expect(g[1].tasks[0].id).toBe("a");
  });
  it("Todas: atrasadas, con fecha y sin fecha", () => {
    const g = groupTasks("todas", [t("a", "2026-10-01"), t("b", "2026-12-01"), t("c", null)], today, new Map());
    expect(g.map((x) => x.tasks.map((y) => y.id))).toEqual([["a"], ["b"], ["c"]]);
  });
  it("Por negocio: alfabético y «Sin negocio» al final", () => {
    const g = groupTasks("negocio", [t("a", null, null), t("b", null, "z"), t("c", null, "y")], today, new Map([["z", "Akerra"], ["y", "Vinted"]]));
    expect(g.map((x) => x.title)).toEqual(["Akerra", "Vinted", "Sin negocio"]);
  });
});

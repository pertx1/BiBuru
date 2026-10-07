import { describe, expect, it } from "vitest";
import { relativeDay, whenLabel } from "./format";
import { groupTasks } from "./groups";
import type { TaskWithSubs } from "./data";

const t = (id: string, due: string | null): TaskWithSubs => ({ id, due_date: due, business_id: null, status: "open", subtasks: [] } as unknown as TaskWithSubs);
const today = "2026-10-05";

describe("agrupar tareas por filtro", () => {
  it("Hoy: «Vencidas» aparte (en rojo) y luego «Hoy»", () => {
    const g = groupTasks("hoy", [t("a", "2026-10-01"), t("b", "2026-10-05")], today);
    expect(g[0]).toMatchObject({ title: "Vencidas", tone: "danger" });
    expect(g[0].tasks.map((x) => x.id)).toEqual(["a"]);
    expect(g[1]).toMatchObject({ title: "Hoy" });
    expect(g[1].tasks.map((x) => x.id)).toEqual(["b"]);
  });
  it("Próximos 7 días: un grupo por día relativo", () => {
    const g = groupTasks("semana", [t("a", "2026-10-06"), t("b", "2026-10-05")], today);
    expect(g.map((x) => x.title)).toEqual(["Hoy", "Mañana", "Miércoles 7", "Jueves 8", "Viernes 9", "Sábado 10", "Domingo 11"]);
    expect(g[1].tasks[0].id).toBe("a");
  });
  it("Pendientes de un negocio: vencidas, con fecha y sin fecha", () => {
    const g = groupTasks("todas", [t("a", "2026-10-01"), t("b", "2026-12-01"), t("c", null)], today);
    expect(g.map((x) => x.tasks.map((y) => y.id))).toEqual([["a"], ["b"], ["c"]]);
  });
});

describe("días relativos", () => {
  it("como Antola", () => {
    expect(relativeDay("2026-10-04", today)).toBe("Ayer");
    expect(relativeDay("2026-10-01", today)).toBe("Hace 4 días");
    expect(relativeDay("2026-10-20", today)).toBe("20/10/2026");
    expect(whenLabel("2026-10-05", "10:00:00", today)).toBe("Hoy a las 10:00");
    expect(whenLabel("2026-10-06", null, today)).toBe("Mañana");
  });
});

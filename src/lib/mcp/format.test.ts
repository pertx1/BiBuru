import { describe, expect, it } from "vitest";
import { parseDay, parseTime, pendingNotes, taskLine } from "./format";

const today = "2026-10-29"; // jueves

describe("fechas y horas dichas por Claude", () => {
  it("palabras, días de la semana y formatos", () => {
    expect(parseDay("hoy", today)).toBe("2026-10-29");
    expect(parseDay("Mañana", today)).toBe("2026-10-30");
    expect(parseDay("pasado mañana", today)).toBe("2026-10-31");
    expect(parseDay("en 5 días", today)).toBe("2026-11-03");
    expect(parseDay("lunes", today)).toBe("2026-11-02");
    expect(parseDay("el jueves", today)).toBe("2026-11-05"); // el próximo, no hoy
    expect(parseDay("2026-12-01", today)).toBe("2026-12-01");
    expect(parseDay("02/11/2026", today)).toBe("2026-11-02");
    expect(parseDay("cuando sea", today)).toBeNull();
    expect(parseDay("2026-02-30", today)).toBeNull();
  });
  it("horas", () => {
    expect(parseTime("9")).toBe("09:00");
    expect(parseTime("9:30")).toBe("09:30");
    expect(parseTime("21h")).toBe("21:00");
    expect(parseTime("25:00")).toBeNull();
  });
});

describe("pendientes y listas", () => {
  it("notas de lo que queda a medias", () => {
    const n = pendingNotes({ source: "Claude Code", whenLocal: { date: today, time: "18:05:12" }, missing: "- Tests\n- Desplegar", context: "Rama x", link: "https://github.com/x/y/pull/1" });
    expect(n).toContain("Dejado a medias en Claude Code el 29/10/2026 a las 18:05.");
    expect(n).toContain("Qué falta:\n- Tests");
    expect(n).toContain("Contexto:\nRama x");
    expect(n).toContain("Enlace: https://github.com/x/y/pull/1");
    expect(pendingNotes({ source: "Claude", whenLocal: { date: today, time: "09:00" }, missing: "Algo" })).not.toContain("Contexto");
  });
  it("línea de tarea con estado, fecha, prioridad, proyecto e id", () => {
    expect(taskLine({ id: "1", title: "A", due_date: "2026-10-28", due_time: "10:00:00", priority: 3, status: "open", category: "IA › Claude" }, today))
      .toBe("- [ ] A · ATRASADA 28/10/2026 10:00 · prioridad alta · proyecto: IA › Claude · id: 1");
    expect(taskLine({ id: "2", title: "B", due_date: null, due_time: null, priority: 2, status: "done" }, today)).toBe("- [x] B · sin fecha · id: 2");
    expect(taskLine({ id: "3", title: "C", due_date: today, due_time: null, priority: 2, status: "open" }, today)).toBe("- [ ] C · hoy · id: 3");
  });
});

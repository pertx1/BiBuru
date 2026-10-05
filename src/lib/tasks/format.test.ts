import { describe, expect, it } from "vitest";
import { dueLabel } from "./format";

describe("etiquetas de fecha", () => {
  const today = "2026-10-05";
  it("hoy, mañana, esta semana, más adelante", () => {
    expect(dueLabel("2026-10-05", "10:00:00", today)).toMatchObject({ text: "Hoy 10:00", today: true });
    expect(dueLabel("2026-10-06", null, today).text).toBe("Mañana");
    expect(dueLabel("2026-10-09", null, today).text).toBe("vie 09/10");
    expect(dueLabel("2026-10-20", "08:30", today).text).toBe("20/10/2026 08:30");
  });
  it("atrasadas", () => {
    expect(dueLabel("2026-10-04", null, today)).toMatchObject({ text: "Atrasada · ayer", overdue: true });
    expect(dueLabel("2026-10-01", "09:00", today).text).toBe("Atrasada · hace 4 días 09:00");
  });
  it("sin fecha", () => expect(dueLabel(null, null, today).text).toBe(""));
});

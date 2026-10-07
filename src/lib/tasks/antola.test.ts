import { describe, expect, it } from "vitest";
import { fieldsToRow, taskFieldsSchema } from "./input";
import { addMonthsClamped, currentOccurrence, describeRepeat, nextOccurrence, stepRecurrence } from "./repeat";
import { computeTaskTiming, timingColumns, timingOn } from "./timing";

const TZ = "Europe/Madrid";

describe("computeTaskTiming", () => {
  it("sin hora: no hay due_at; con hora, la convierte a UTC (verano +2, invierno +1)", () => {
    expect(computeTaskTiming({ dueDate: "2026-07-10", time: null, reminderMode: "none" }, TZ).dueAt).toBeNull();
    expect(computeTaskTiming({ dueDate: "2026-07-10", time: "10:00", reminderMode: "none" }, TZ).dueAt?.toISOString()).toBe("2026-07-10T08:00:00.000Z");
    expect(computeTaskTiming({ dueDate: "2026-12-10", time: "10:00", reminderMode: "none" }, TZ).dueAt?.toISOString()).toBe("2026-12-10T09:00:00.000Z");
  });

  it("«a una hora»: el aviso es ese instante", () => {
    const t = computeTaskTiming({ dueDate: null, time: null, reminderMode: "at_time", reminderDate: "2026-10-12", reminderTime: "18:30" }, TZ);
    expect(t.reminderMode).toBe("at_time");
    expect(t.reminderAt?.toISOString()).toBe("2026-10-12T16:30:00.000Z");
    expect(t.remindAt?.toISOString()).toBe("2026-10-12T16:30:00.000Z");
  });

  it("«antes»: resta los minutos a la hora de la tarea, o a las 9:00 si no tiene hora", () => {
    expect(computeTaskTiming({ dueDate: "2026-10-12", time: "10:00", reminderMode: "before", reminderMinutesBefore: 15 }, TZ).remindAt?.toISOString()).toBe("2026-10-12T07:45:00.000Z");
    expect(computeTaskTiming({ dueDate: "2026-10-12", time: null, reminderMode: "before", reminderMinutesBefore: 1440 }, TZ).remindAt?.toISOString()).toBe("2026-10-11T07:00:00.000Z");
  });

  it("si falta lo necesario, el aviso queda desactivado", () => {
    expect(computeTaskTiming({ dueDate: null, time: null, reminderMode: "before", reminderMinutesBefore: 10 }, TZ).reminderMode).toBe("none");
    expect(computeTaskTiming({ dueDate: "2026-10-12", time: null, reminderMode: "at_time", reminderDate: "2026-10-12" }, TZ).remindAt).toBeNull();
  });

  it("cambio de hora: la misma hora local antes y después del 25/10 cambia de UTC", () => {
    const before = computeTaskTiming({ dueDate: "2026-10-24", time: "09:00", reminderMode: "before", reminderMinutesBefore: 0 }, TZ);
    const after = computeTaskTiming({ dueDate: "2026-10-26", time: "09:00", reminderMode: "before", reminderMinutesBefore: 0 }, TZ);
    expect(before.dueAt?.toISOString()).toBe("2026-10-24T07:00:00.000Z");
    expect(after.dueAt?.toISOString()).toBe("2026-10-26T08:00:00.000Z");
    // 02:30 del 29/03 no existe en Madrid: se lleva a la siguiente hora válida.
    expect(computeTaskTiming({ dueDate: "2026-03-29", time: "02:30", reminderMode: "none" }, TZ).dueAt?.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("timingOn mantiene hora local y desfase del aviso al mover la tarea, aunque cambie la hora", () => {
    const from = computeTaskTiming({ dueDate: "2026-10-24", time: "09:00", reminderMode: "at_time", reminderDate: "2026-10-23", reminderTime: "20:00" }, TZ);
    const moved = timingOn({ due_time: "09:00:00", reminder_mode: "at_time", reminder_at: from.reminderAt!.toISOString(), reminder_minutes_before: null }, "2026-10-24", "2026-10-31", TZ);
    expect(moved.dueAt?.toISOString()).toBe("2026-10-31T08:00:00.000Z");
    expect(moved.reminderAt?.toISOString()).toBe("2026-10-30T19:00:00.000Z");
  });

  it("timingColumns no programa un aviso que ya pasó", () => {
    const t = computeTaskTiming({ dueDate: "2026-10-12", time: "10:00", reminderMode: "before", reminderMinutesBefore: 0 }, TZ);
    expect(timingColumns(t, new Date("2026-10-12T07:00:00Z")).remind_at).toBe("2026-10-12T08:00:00.000Z");
    expect(timingColumns(t, new Date("2026-10-12T09:00:00Z")).remind_at).toBeNull();
  });
});

describe("repetición", () => {
  it("stepRecurrence: cada día, semana, mes y días concretos (0 = domingo)", () => {
    expect(stepRecurrence("2026-10-07", "daily", [], 7)).toBe("2026-10-08");
    expect(stepRecurrence("2026-10-07", "weekly", [], 7)).toBe("2026-10-14");
    expect(stepRecurrence("2026-10-07", "monthly", [], 7)).toBe("2026-11-07");
    // Miércoles 7/10 con lunes y viernes → viernes 9; desde el viernes → lunes 12.
    expect(stepRecurrence("2026-10-07", "weekdays", [1, 5], 7)).toBe("2026-10-09");
    expect(stepRecurrence("2026-10-09", "weekdays", [1, 5], 9)).toBe("2026-10-12");
    expect(stepRecurrence("2026-10-07", "weekdays", [], 7)).toBe("2026-10-08");
    expect(stepRecurrence("2026-10-07", "none", [], 7)).toBeNull();
  });

  it("día 31 → último día de los meses cortos y vuelve al 31", () => {
    expect(addMonthsClamped("2026-01-31", 1, 31)).toBe("2026-02-28");
    expect(addMonthsClamped("2028-01-31", 1, 31)).toBe("2028-02-29");
    expect(stepRecurrence("2026-02-28", "monthly", [], 31)).toBe("2026-03-31");
    expect(nextOccurrence("2026-01-31", "2026-02-01", "monthly", [])).toBe("2026-02-28");
    expect(nextOccurrence("2026-01-31", "2026-03-01", "monthly", [])).toBe("2026-03-31");
    expect(nextOccurrence("2026-01-31", "2026-04-01", "monthly", [])).toBe("2026-04-30");
    expect(addMonthsClamped("2026-12-31", 1, 31)).toBe("2027-01-31");
  });

  it("nextOccurrence: completar tarde salta a la primera fecha posterior a hoy; antes de tiempo, a la siguiente", () => {
    expect(nextOccurrence("2026-10-01", "2026-10-07", "daily", [])).toBe("2026-10-08");
    expect(nextOccurrence("2026-10-01", "2026-10-07", "weekly", [])).toBe("2026-10-08");
    expect(nextOccurrence("2026-10-10", "2026-10-07", "weekly", [])).toBe("2026-10-17");
    expect(nextOccurrence("2026-10-07", "2026-10-07", "none", [])).toBeNull();
  });

  it("currentOccurrence: la última de la serie que no pasa de hoy, o null si ya está al día", () => {
    expect(currentOccurrence("2026-10-01", "2026-10-07", "daily", [])).toBe("2026-10-07");
    expect(currentOccurrence("2026-10-01", "2026-10-07", "weekly", [])).toBeNull();      // la siguiente sería el 8
    expect(currentOccurrence("2026-09-20", "2026-10-07", "weekly", [])).toBe("2026-10-04"); // sigue siendo anterior a hoy
    expect(currentOccurrence("2026-10-05", "2026-10-07", "weekdays", [1, 3])).toBe("2026-10-07");
    expect(currentOccurrence("2026-10-07", "2026-10-07", "daily", [])).toBeNull();
    expect(currentOccurrence("2026-10-08", "2026-10-07", "daily", [])).toBeNull();
    expect(currentOccurrence("2026-01-31", "2026-03-15", "monthly", [])).toBe("2026-02-28");
  });

  it("describeRepeat en castellano", () => {
    expect(describeRepeat("weekdays", [1, 3, 5], null)).toBe("L, X y V");
    expect(describeRepeat("weekdays", [0], null)).toBe("Cada domingo");
    expect(describeRepeat("weekly", [], "2026-10-07")).toBe("Cada semana (miércoles)");
    expect(describeRepeat("monthly", [], "2026-10-31")).toBe("Cada mes (día 31)");
  });
});

describe("formulario", () => {
  const base = { title: "Llamar a la imprenta" };
  it("valida como Antola", () => {
    expect(taskFieldsSchema.safeParse({ ...base, reminderMode: "before", reminderMinutesBefore: 10 }).error?.issues[0].message).toBe("Para avisar antes, la tarea necesita una fecha.");
    expect(taskFieldsSchema.safeParse({ ...base, reminderMode: "at_time", reminderDate: "2026-10-08" }).error?.issues[0].message).toBe("Elige el día y la hora del recordatorio.");
    expect(taskFieldsSchema.safeParse({ ...base, time: "10:00" }).success).toBe(false);
    expect(taskFieldsSchema.safeParse({ ...base, reminderMode: "before", reminderMinutesBefore: 7, dueDate: "2026-10-08" }).success).toBe(false);
    expect(taskFieldsSchema.safeParse({ title: "  " }).success).toBe(false);
  });

  it("repetir sin fecha empieza hoy; días concretos sin días no se repite", () => {
    const now = new Date("2026-10-07T10:00:00Z");
    const a = fieldsToRow(taskFieldsSchema.parse({ ...base, repeat: "daily" }), TZ, now);
    expect(a.due_date).toBe("2026-10-07");
    expect(a.repeat).toBe("daily");
    const b = fieldsToRow(taskFieldsSchema.parse({ ...base, repeat: "weekdays", repeatDays: [] }), TZ, now);
    expect(b.repeat).toBe("none");
    expect(b.due_date).toBeNull();
    const c = fieldsToRow(taskFieldsSchema.parse({ ...base, dueDate: "2026-10-08", time: "10:00", reminderMode: "before", reminderMinutesBefore: 30 }), TZ, now);
    expect(c.due_at).toBe("2026-10-08T08:00:00.000Z");
    expect(c.remind_at).toBe("2026-10-08T07:30:00.000Z");
    expect(c.priority).toBe(2);
  });
});

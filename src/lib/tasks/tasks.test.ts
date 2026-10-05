import { describe, expect, it } from "vitest";
import { describeRecurrence, nextOccurrence, occurrencesBetween, parseRecurrence } from "./recurrence";
import { parseQuickTask } from "./quick-parse";
import { snooze } from "./snooze";

const TODAY = "2026-10-05"; // lunes
const q = (t: string, now = "09:00") => parseQuickTask(t, TODAY, now);

describe("alta rápida en lenguaje natural", () => {
  it("ejemplo del encargo", () => {
    expect(q("llamar a la imprenta mañana a las 10")).toMatchObject({ title: "Llamar a la imprenta", date: "2026-10-06", time: "10:00" });
  });
  it.each([
    ["comprar tela hoy", "2026-10-05", null, "Comprar tela"],
    ["pasado mañana a las 9 reunión", "2026-10-07", "09:00", "Reunión"],
    ["enviar paquete hoy a las 5 de la tarde", "2026-10-05", "17:00", "Enviar paquete"],
    ["cenar mañana a las 9 de la noche", "2026-10-06", "21:00", "Cenar"],
    ["recoger pedido el viernes", "2026-10-09", null, "Recoger pedido"],
    ["revisar stock el lunes", "2026-10-12", null, "Revisar stock"],          // hoy es lunes: el próximo
    ["hacer factura este miércoles a las 18:30", "2026-10-07", "18:30", "Hacer factura"],
    ["pedir presupuesto el próximo martes", "2026-10-06", null, "Pedir presupuesto"],
    ["reunión con Ana el 15/10 a las 18:30", "2026-10-15", "18:30", "Reunión con Ana"],
    ["pagar la luz el 3 de noviembre", "2026-11-03", null, "Pagar la luz"],
    ["declaración 20 nov", "2026-11-20", null, "Declaración"],
    ["pagar el 15", "2026-10-15", null, "Pagar"],
    ["pagar el 2", "2026-11-02", null, "Pagar"],                                // el 2 ya pasó: mes siguiente
    ["revisar cuentas la semana que viene", "2026-10-12", null, "Revisar cuentas"],
    ["dentro de 3 días mandar presupuesto", "2026-10-08", null, "Mandar presupuesto"],
    ["llamar en 2 semanas", "2026-10-19", null, "Llamar"],
    ["renovar seguro el mes que viene", "2026-11-05", null, "Renovar seguro"],
    ["llamar a las 20:00", "2026-10-05", "20:00", "Llamar"],
    ["médico mañana a las 10 y media", "2026-10-06", "10:30", "Médico"],
    ["cita a las 10 menos cuarto", "2026-10-05", "09:45", "Cita"],
    ["comer con Pedro mañana al mediodía", "2026-10-06", "12:00", "Comer con Pedro"],
    ["correr mañana por la mañana", "2026-10-06", "09:00", "Correr"],
  ])("«%s»", (text, date, time, title) => {
    expect(q(text)).toMatchObject({ date, time, title });
  });

  it("sin fecha deja la tarea sin fecha", () => {
    expect(q("pensar nombre de la colección")).toMatchObject({ title: "Pensar nombre de la colección", date: null, time: null });
  });
  it("«mañana» dentro de «por la mañana» no es el día siguiente", () => {
    expect(q("llamar por la mañana")).toMatchObject({ date: "2026-10-05", time: "09:00", title: "Llamar" });
  });
  it("fecha ya pasada este año va al año siguiente", () => {
    expect(q("felicitar el 1/3")).toMatchObject({ date: "2027-03-01" });
  });
  it("fecha imposible no se inventa", () => {
    expect(q("algo el 31/02").date).toBeNull();
  });
  it("prioridad con ! y negocio con #", () => {
    expect(q("pedir tela !! #akerra mañana")).toMatchObject({ title: "Pedir tela", priority: 3, businessHint: "akerra", date: "2026-10-06" });
    expect(q("limpiar !")).toMatchObject({ priority: 2 });
  });
  it("en N horas usa la hora actual", () => {
    expect(q("llamar en 2 horas", "10:15")).toMatchObject({ date: "2026-10-05", time: "12:15" });
    expect(q("llamar en 2 horas", "23:00")).toMatchObject({ date: "2026-10-06", time: "01:00" });
  });
  it("recurrencias", () => {
    expect(q("revisar stock cada lunes")).toMatchObject({ title: "Revisar stock", recurrence: { freq: "weekly", interval: 1, byweekday: [0] }, date: "2026-10-05" });
    expect(q("gimnasio cada martes y jueves")).toMatchObject({ recurrence: { freq: "weekly", byweekday: [1, 3] }, date: "2026-10-06" });
    expect(q("pagar autónomos cada mes el 20")).toMatchObject({ recurrence: { freq: "monthly", interval: 1 }, date: "2026-10-20" });
    expect(q("tomar vitamina todos los días a las 8")).toMatchObject({ recurrence: { freq: "daily", interval: 1 }, time: "08:00", date: "2026-10-05" });
    expect(q("limpiar filtros cada 2 semanas")).toMatchObject({ recurrence: { freq: "weekly", interval: 2 } });
  });
  it("no rompe con texto raro o vacío", () => {
    expect(q("   ").title).toBe("");
    expect(q("a las 99:99 llamar").time).toBeNull();
    expect(q("x".repeat(500)).title.length).toBe(200);
  });
});

describe("recurrencias", () => {
  it("validación", () => {
    expect(parseRecurrence({ freq: "weekly", interval: 2, byweekday: [4, 0, 0, 9] })).toEqual({ freq: "weekly", interval: 2, byweekday: [0, 4] });
    expect(parseRecurrence({ freq: "raro" })).toBeNull();
    expect(parseRecurrence({ freq: "daily", interval: 0 })).toBeNull();
    expect(parseRecurrence(null)).toBeNull();
  });
  it("diaria cada 3 días", () => {
    expect(occurrencesBetween({ freq: "daily", interval: 3 }, "2026-10-01", "2026-10-05", "2026-10-15")).toEqual(["2026-10-07", "2026-10-10", "2026-10-13"]);
  });
  it("semanal con varios días (semana desde lunes)", () => {
    const rec = { freq: "weekly" as const, interval: 1, byweekday: [0, 3] };
    expect(occurrencesBetween(rec, "2026-10-05", "2026-10-05", "2026-10-18")).toEqual(["2026-10-05", "2026-10-08", "2026-10-12", "2026-10-15"]);
  });
  it("semanal cada 2 semanas", () => {
    const rec = { freq: "weekly" as const, interval: 2, byweekday: [2] };
    expect(occurrencesBetween(rec, "2026-10-07", "2026-10-01", "2026-11-15")).toEqual(["2026-10-07", "2026-10-21", "2026-11-04"]);
  });
  it("semanal sin días usa el día del ancla", () => {
    expect(occurrencesBetween({ freq: "weekly", interval: 1 }, "2026-10-08", "2026-10-01", "2026-10-31")).toEqual(["2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29"]);
  });
  it("mensual el 31 no deriva (31 → 28 → 31 → 30)", () => {
    const rec = { freq: "monthly" as const, interval: 1 };
    expect(occurrencesBetween(rec, "2026-01-31", "2026-01-01", "2026-05-31")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });
  it("anual con 29 de febrero", () => {
    const rec = { freq: "yearly" as const, interval: 1 };
    expect(occurrencesBetween(rec, "2028-02-29", "2028-01-01", "2032-12-31")).toEqual(["2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
  });
  it("respeta «hasta» y no devuelve fechas anteriores al inicio", () => {
    const rec = { freq: "daily" as const, interval: 1, until: "2026-10-07" };
    expect(occurrencesBetween(rec, "2026-10-05", "2026-10-01", "2026-10-31")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
  });
  it("cruza el cambio de hora sin saltarse días", () => {
    expect(occurrencesBetween({ freq: "daily", interval: 1 }, "2026-10-24", "2026-10-24", "2026-10-27")).toEqual(["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
  });
  it("siguiente aparición", () => {
    expect(nextOccurrence({ freq: "daily", interval: 1 }, "2026-10-05", "2026-10-05")).toBe("2026-10-06");
    expect(nextOccurrence({ freq: "weekly", interval: 1, byweekday: [0, 3] }, "2026-10-05", "2026-10-08")).toBe("2026-10-12");
    expect(nextOccurrence({ freq: "monthly", interval: 1 }, "2026-01-31", "2026-02-28")).toBe("2026-03-31");
    expect(nextOccurrence({ freq: "daily", interval: 1, until: "2026-10-05" }, "2026-10-05", "2026-10-05")).toBeNull();
    // completada tarde: salta a la próxima futura, no genera atrasadas
    expect(nextOccurrence({ freq: "daily", interval: 1 }, "2026-10-01", "2026-10-05")).toBe("2026-10-06");
  });
  it("descripción en español", () => {
    expect(describeRecurrence({ freq: "daily", interval: 1 })).toBe("Cada día");
    expect(describeRecurrence({ freq: "weekly", interval: 2, byweekday: [0, 3], until: "2026-12-31" })).toBe("Cada 2 semanas (lun, jue) hasta 31/12/2026");
  });
});

describe("posponer", () => {
  const due = { date: "2026-10-05", time: "10:00" };
  it("1 hora", () => {
    expect(snooze("1h", { date: "2026-10-05", time: "10:20" }, due)).toEqual({ date: "2026-10-05", time: "11:20" });
    expect(snooze("1h", { date: "2026-10-05", time: "23:30" }, due)).toEqual({ date: "2026-10-06", time: "00:30" });
  });
  it("esta tarde", () => {
    expect(snooze("tarde", { date: "2026-10-05", time: "09:00" }, due)).toEqual({ date: "2026-10-05", time: "17:00" });
    expect(snooze("tarde", { date: "2026-10-05", time: "17:30" }, due)).toEqual({ date: "2026-10-05", time: "20:00" });
    expect(snooze("tarde", { date: "2026-10-05", time: "21:00" }, due)).toEqual({ date: "2026-10-06", time: "09:00" });
  });
  it("mañana y semana que viene conservan la hora", () => {
    expect(snooze("manana", { date: "2026-10-05", time: "09:00" }, due)).toEqual({ date: "2026-10-06", time: "10:00" });
    expect(snooze("semana", { date: "2026-10-08", time: "09:00" }, { date: "2026-10-08", time: null })).toEqual({ date: "2026-10-12", time: null });
    expect(snooze("semana", { date: "2026-10-11", time: "09:00" }, due).date).toBe("2026-10-12"); // domingo -> lunes siguiente
  });
});

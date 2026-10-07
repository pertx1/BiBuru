import { describe, expect, it } from "vitest";
import {
  addMinutes, eventOccurrences, inQuietHours, planDailyDigest, planEventReminders, planOverdueAlert, planTaskPushes, planWeeklyReview, type Local, type Prefs,
} from "./planning";

const prefs: Prefs = {
  event_lead_minutes: 30, quiet_hours_start: "22:00", quiet_hours_end: "08:00",
  daily_digest_enabled: true, daily_digest_time: "08:00", overdue_alert_enabled: true, overdue_alert_time: "17:00",
  weekly_review_enabled: true, weekly_review_dow: 0, weekly_review_time: "10:00",
};
const L = (date: string, time: string): Local => ({ date, time });

describe("horas y silencio", () => {
  it("suma minutos cruzando la medianoche", () => {
    expect(addMinutes(L("2026-10-05", "23:50"), 20)).toEqual(L("2026-10-06", "00:10"));
    expect(addMinutes(L("2026-10-05", "00:10"), -20)).toEqual(L("2026-10-04", "23:50"));
  });
  it("horas de silencio que cruzan la medianoche", () => {
    expect(inQuietHours("23:00", "22:00", "08:00")).toBe(true);
    expect(inQuietHours("03:00", "22:00", "08:00")).toBe(true);
    expect(inQuietHours("08:00", "22:00", "08:00")).toBe(false);
    expect(inQuietHours("12:00", "22:00", "08:00")).toBe(false);
    expect(inQuietHours("12:00", "13:00", "15:00")).toBe(false);
    expect(inQuietHours("14:00", "13:00", "15:00")).toBe(true);
    expect(inQuietHours("03:00", "00:00", "00:00")).toBe(false); // inicio = fin: sin silencio
  });
});

describe("avisos de tareas (remind_at)", () => {
  const t = (o: Partial<{ id: string; title: string; due_date: string | null; due_time: string | null; remind_at: string | null }> = {}) =>
    ({ id: "t1", title: "Llamar a la imprenta", due_date: "2026-10-05", due_time: "10:00:00", remind_at: "2026-10-05T07:45:00.000Z", ...o });
  const now = new Date("2026-10-05T07:45:30Z"); // 09:45 en Madrid
  it("avisa cuando llega remind_at: título = la tarea, debajo cuándo; abre su detalle", () => {
    expect(planTaskPushes([t()], "Europe/Madrid", new Date("2026-10-05T07:44:00Z")).pushes).toEqual([]);
    const [p] = planTaskPushes([t()], "Europe/Madrid", now).pushes;
    expect(p).toMatchObject({ key: "task:t1:2026-10-05T07:45:00.000Z", tag: "task:t1", kind: "task", title: "Llamar a la imprenta", body: "Hoy a las 10:00", url: "/tareas/t1", remindAt: "2026-10-05T07:45:00.000Z" });
    expect(planTaskPushes([t({ due_date: "2026-10-06", due_time: null })], "Europe/Madrid", now).pushes[0].body).toBe("Mañana");
    expect(planTaskPushes([t({ due_date: null, due_time: null })], "Europe/Madrid", now).pushes[0].body).toBe("Tarea pendiente");
  });
  it("con más de 2 h de retraso (silencio, cron caído) se descarta", () => {
    const r = planTaskPushes([t()], "Europe/Madrid", new Date("2026-10-05T09:46:00Z"));
    expect(r.pushes).toEqual([]);
    expect(r.stale).toEqual([{ id: "t1", remind_at: "2026-10-05T07:45:00.000Z" }]);
  });
  it("posponer cambia remind_at y por tanto la clave: vuelve a avisar", () => {
    const a = planTaskPushes([t()], "Europe/Madrid", now).pushes[0].key;
    const b = planTaskPushes([t({ remind_at: "2026-10-05T08:00:00.000Z" })], "Europe/Madrid", new Date("2026-10-05T08:00:00Z")).pushes[0].key;
    expect(a).not.toBe(b);
  });
});

describe("recordatorios de eventos", () => {
  const ev = { id: "e1", title: "Reunión con imprenta", date: "2026-10-05", startTime: "11:00", location: "Taller" };
  it("avisa 30 min antes y hasta que empieza", () => {
    expect(planEventReminders([ev], prefs, L("2026-10-05", "10:29"))).toEqual([]);
    const [p] = planEventReminders([ev], prefs, L("2026-10-05", "10:30"));
    expect(p).toMatchObject({ key: "event:e1:2026-10-05T11:00", title: "Reunión con imprenta · en 30 min", body: "11:00 · Taller", url: "/aviso/event/e1?d=2026-10-05" });
    expect(planEventReminders([ev], prefs, L("2026-10-05", "11:00"))[0].title).toContain("ahora");
    expect(planEventReminders([ev], prefs, L("2026-10-05", "11:01"))).toEqual([]);
  });
  it("cada aparición de un evento recurrente tiene su propia clave", () => {
    const occ = eventOccurrences([{ id: "e2", title: "Semanal", location: null, all_day: false, start_date: "2026-09-28", start_time: "09:00:00", end_date: "2026-09-28", recurrence: { freq: "weekly", interval: 1 } }], "2026-10-05", "2026-10-06");
    expect(occ).toEqual([{ id: "e2", title: "Semanal", date: "2026-10-05", startTime: "09:00", location: null }]);
    expect(planEventReminders(occ, prefs, L("2026-10-05", "08:30"))[0].key).toBe("event:e2:2026-10-05T09:00");
  });
  it("los eventos de todo el día no generan aviso propio", () => {
    expect(eventOccurrences([{ id: "e3", title: "Feria", location: null, all_day: true, start_date: "2026-10-05", start_time: null, end_date: "2026-10-06", recurrence: null }], "2026-10-05", "2026-10-05")[0].startTime).toBeNull();
    expect(planEventReminders([{ id: "e3", title: "Feria", date: "2026-10-05", startTime: null, location: null }], prefs, L("2026-10-05", "08:30"))).toEqual([]);
  });
});

describe("resumen diario, atrasadas y revisión semanal", () => {
  const data = { todayTasks: [{ title: "Pedir tela", due_time: "10:00" }, { title: "Revisar cuentas", due_time: null }], overdueCount: 2, todayEvents: [{ title: "Reunión", startTime: "09:00" }] };
  it("resumen a su hora, una vez por día", () => {
    expect(planDailyDigest(prefs, L("2026-10-05", "07:59"), data)).toBeNull();
    const p = planDailyDigest(prefs, L("2026-10-05", "08:00"), data)!;
    expect(p.key).toBe("digest:2026-10-05");
    expect(p.title).toBe("Buenos días · lunes 5 de octubre");
    expect(p.body).toBe("Hoy: 2 tareas y 1 evento.\nPrimero: 09:00 Reunión\n2 atrasadas.");
    expect(planDailyDigest(prefs, L("2026-10-05", "11:01"), data)).toBeNull(); // margen de 3 h
  });
  it("no envía resumen vacío ni si está desactivado", () => {
    expect(planDailyDigest(prefs, L("2026-10-05", "08:00"), { todayTasks: [], overdueCount: 0, todayEvents: [] })).toBeNull();
    expect(planDailyDigest({ ...prefs, daily_digest_enabled: false }, L("2026-10-05", "08:00"), data)).toBeNull();
  });
  it("aviso de la tarde solo si hay atrasadas", () => {
    expect(planOverdueAlert(prefs, L("2026-10-05", "17:00"), 0)).toBeNull();
    expect(planOverdueAlert(prefs, L("2026-10-05", "16:59"), 3)).toBeNull();
    expect(planOverdueAlert(prefs, L("2026-10-05", "17:00"), 1)!.title).toBe("Tienes 1 tarea atrasada");
    expect(planOverdueAlert(prefs, L("2026-10-05", "17:00"), 3)!.title).toBe("Tienes 3 tareas atrasadas");
  });
  it("revisión semanal: día elegido, una vez, con objetivos activos", () => {
    expect(planWeeklyReview(prefs, L("2026-10-05", "10:00"), 2)!.key).toBe("weekly:2026-10-05"); // lunes
    expect(planWeeklyReview(prefs, L("2026-10-06", "10:00"), 2)).toBeNull();                      // martes
    expect(planWeeklyReview(prefs, L("2026-10-05", "10:00"), 0)).toBeNull();
    expect(planWeeklyReview({ ...prefs, weekly_review_dow: 4 }, L("2026-10-09", "10:30"), 1)!.body).toContain("1 objetivo activo");
  });
});

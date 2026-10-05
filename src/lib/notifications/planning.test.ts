import { describe, expect, it } from "vitest";
import {
  addMinutes, eventOccurrences, inQuietHours, planDailyDigest, planEventReminders, planOverdueAlert, planTaskReminders, planWeeklyReview, type Local, type Prefs, type TaskRow,
} from "./planning";

const prefs: Prefs = {
  task_lead_minutes: 0, event_lead_minutes: 30, quiet_hours_start: "22:00", quiet_hours_end: "08:00",
  daily_digest_enabled: true, daily_digest_time: "08:00", overdue_alert_enabled: true, overdue_alert_time: "17:00",
  weekly_review_enabled: true, weekly_review_dow: 0, weekly_review_time: "10:00",
};
const L = (date: string, time: string): Local => ({ date, time });
const task = (o: Partial<TaskRow> = {}): TaskRow => ({
  id: "t1", title: "Llamar a la imprenta", due_date: "2026-10-05", due_time: "10:00:00", status: "open", parent_id: null, updatedLocal: L("2026-10-04", "20:00"), ...o,
});

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

describe("recordatorios de tareas", () => {
  it("avisa a su hora y no antes", () => {
    expect(planTaskReminders([task()], prefs, L("2026-10-05", "09:59"))).toEqual([]);
    const [p] = planTaskReminders([task()], prefs, L("2026-10-05", "10:00"));
    expect(p).toMatchObject({ key: "task:t1:2026-10-05T10:00", title: "Tarea · 10:00", body: "Llamar a la imprenta", url: "/aviso/task/t1" });
  });
  it("con antelación configurable", () => {
    const p = { ...prefs, task_lead_minutes: 15 };
    expect(planTaskReminders([task()], p, L("2026-10-05", "09:44"))).toEqual([]);
    expect(planTaskReminders([task()], p, L("2026-10-05", "09:45"))[0].title).toBe("Tarea en 15 min · 10:00");
  });
  it("sigue disponible en minutos posteriores (el registro evita duplicarlo) y caduca a las 6 h", () => {
    expect(planTaskReminders([task()], prefs, L("2026-10-05", "10:03"))).toHaveLength(1);
    expect(planTaskReminders([task()], prefs, L("2026-10-05", "16:00"))).toHaveLength(1);
    expect(planTaskReminders([task()], prefs, L("2026-10-05", "16:01"))).toHaveLength(0);
  });
  it("no avisa de tareas que ya estaban vencidas cuando se editaron (importación, etc.)", () => {
    expect(planTaskReminders([task({ updatedLocal: L("2026-10-05", "11:00") })], prefs, L("2026-10-05", "11:05"))).toEqual([]);
  });
  it("tarea con antelación puesta a pocos minutos del vencimiento sí avisa", () => {
    const p = { ...prefs, task_lead_minutes: 30 };
    expect(planTaskReminders([task({ updatedLocal: L("2026-10-05", "09:50") })], p, L("2026-10-05", "09:51"))).toHaveLength(1);
  });
  it("ignora hechas, subtareas y tareas sin hora", () => {
    const now = L("2026-10-05", "10:00");
    expect(planTaskReminders([task({ status: "done" }), task({ id: "s", parent_id: "t1" }), task({ id: "n", due_time: null })], prefs, now)).toEqual([]);
  });
  it("una tarea pospuesta cambia de clave y vuelve a avisar", () => {
    const a = planTaskReminders([task()], prefs, L("2026-10-05", "10:00"))[0].key;
    const b = planTaskReminders([task({ due_time: "11:00", updatedLocal: L("2026-10-05", "10:01") })], prefs, L("2026-10-05", "11:00"))[0].key;
    expect(a).not.toBe(b);
  });
  it("al amanecer envía lo que cayó en horas de silencio, si no ha pasado demasiado", () => {
    const t = task({ due_date: "2026-10-05", due_time: "05:30:00", updatedLocal: L("2026-10-04", "20:00") });
    expect(planTaskReminders([t], prefs, L("2026-10-05", "08:00"))).toHaveLength(1);   // 2,5 h tarde: ok
    expect(planTaskReminders([task({ due_time: "23:00:00", due_date: "2026-10-04" })], prefs, L("2026-10-05", "08:00"))).toHaveLength(0); // 9 h tarde: lo cubre el resumen
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

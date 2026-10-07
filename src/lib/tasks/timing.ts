/**
 * Hora local ↔ UTC de una tarea (como `computeTaskTiming` de Antola). El usuario elige fecha y hora «de pared» en su
 * zona; aquí se calculan los instantes UTC que usa el cron: `due_at` (si tiene hora), `reminder_at` (aviso «a una
 * hora») y `remind_at` (próximo aviso pendiente). Puro: sin red ni base de datos.
 */
import { addDays, diffDays, nowLocal, zonedToUtc } from "@/lib/dates";

/** Hora de referencia para «X min antes» de una tarea sin hora. */
export const DEFAULT_REFERENCE_TIME = "09:00";

export const REMINDER_MODES = ["none", "at_time", "before"] as const;
export type ReminderMode = (typeof REMINDER_MODES)[number];

export const REMINDER_BEFORE_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440] as const;
export const REMINDER_BEFORE_LABEL: Record<number, string> = {
  0: "A la hora", 5: "5 min antes", 10: "10 min antes", 15: "15 min antes", 30: "30 min antes", 60: "1 h antes", 120: "2 h antes", 1440: "1 día antes",
};

export type TaskTimingInput = {
  dueDate: string | null;
  time: string | null;                       // "HH:MM" local
  reminderMode: ReminderMode;
  reminderDate?: string | null;              // at_time
  reminderTime?: string | null;              // at_time
  reminderMinutesBefore?: number | null;     // before
};

export type TaskTiming = {
  dueAt: Date | null;
  reminderMode: ReminderMode;
  reminderAt: Date | null;
  reminderMinutesBefore: number | null;
  remindAt: Date | null;
};

/** Convierte lo que elige el usuario (hora local) en instantes UTC. Si falta algo, el aviso queda en «none». */
export function computeTaskTiming(input: TaskTimingInput, timeZone: string): TaskTiming {
  const dueAt = input.dueDate && input.time ? zonedToUtc(input.dueDate, input.time, timeZone) : null;
  let reminderMode = input.reminderMode;
  let reminderAt: Date | null = null;
  let reminderMinutesBefore: number | null = null;
  let remindAt: Date | null = null;

  if (reminderMode === "at_time" && input.reminderDate && input.reminderTime) {
    reminderAt = zonedToUtc(input.reminderDate, input.reminderTime, timeZone);
    remindAt = reminderAt;
  } else if (reminderMode === "before" && input.dueDate && input.reminderMinutesBefore != null) {
    reminderMinutesBefore = input.reminderMinutesBefore;
    const reference = dueAt ?? zonedToUtc(input.dueDate, DEFAULT_REFERENCE_TIME, timeZone);
    remindAt = new Date(reference.getTime() - reminderMinutesBefore * 60_000);
  } else {
    reminderMode = "none";
  }
  return { dueAt, reminderMode, reminderAt, reminderMinutesBefore, remindAt };
}

export type TimingSource = { due_time: string | null; reminder_mode: string; reminder_at: string | null; reminder_minutes_before: number | null };

/** Hora y aviso de una tarea llevados de `from` a `to` (misma hora local y mismo desfase del aviso «a una hora»). */
export function timingOn(task: TimingSource, from: string, to: string, timeZone: string): TaskTiming {
  const at = task.reminder_at ? nowLocal(new Date(task.reminder_at), timeZone) : null;
  return computeTaskTiming({
    dueDate: to,
    time: task.due_time?.slice(0, 5) ?? null,
    reminderMode: task.reminder_mode as ReminderMode,
    reminderDate: at ? addDays(at.date, diffDays(from, to)) : null,
    reminderTime: at?.time ?? null,
    reminderMinutesBefore: task.reminder_minutes_before,
  }, timeZone);
}

/** Columnas de base de datos. Un aviso que ya pasó al guardar no se programa (no avisa de lo pasado). */
export function timingColumns(t: TaskTiming, now: Date = new Date()) {
  return {
    due_at: t.dueAt?.toISOString() ?? null,
    reminder_mode: t.reminderMode,
    reminder_at: t.reminderAt?.toISOString() ?? null,
    reminder_minutes_before: t.reminderMinutesBefore,
    remind_at: t.remindAt && t.remindAt.getTime() > now.getTime() ? t.remindAt.toISOString() : null,
  };
}

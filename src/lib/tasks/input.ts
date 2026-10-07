/**
 * Validación y conversión de lo que llega del formulario de tareas (crear y editar), como `task-input` de Antola.
 * Se usa en cliente (mensajes) y servidor (Server Actions). Fechas «AAAA-MM-DD», horas «HH:MM» locales.
 */
import { z } from "zod";
import { isoDate } from "@/lib/schemas";
import { nowLocal } from "@/lib/dates";
import { REPEATS, type Repeat } from "./repeat";
import { computeTaskTiming, REMINDER_BEFORE_OPTIONS, REMINDER_MODES, timingColumns, type ReminderMode } from "./timing";

export const PRIORITIES = [3, 2, 1] as const;
export const PRIORITY_META: Record<number, { label: string; emoji: string; ring: string; text: string }> = {
  3: { label: "Alta", emoji: "🔴", ring: "border-danger", text: "text-danger" },
  2: { label: "Media", emoji: "🟡", ring: "border-amber-500", text: "text-amber-600 dark:text-amber-400" },
  1: { label: "Baja", emoji: "⚪", ring: "border-muted/60", text: "text-muted" },
};

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida (HH:MM)");
const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

export const taskFieldsSchema = z.object({
  title: z.string().trim().min(1, "Escribe qué hay que hacer").max(300, "Máximo 300 caracteres"),
  notes: z.preprocess(blankToNull, z.string().trim().max(5000).nullable()),
  priority: z.coerce.number().int().min(1).max(3).default(2),
  dueDate: z.preprocess(blankToNull, isoDate.nullable()),
  time: z.preprocess(blankToNull, hm.nullable()),
  businessId: z.preprocess(blankToNull, z.uuid().nullable()),
  goalId: z.preprocess(blankToNull, z.uuid().nullable()),
  repeat: z.enum(REPEATS).default("none"),
  repeatDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  reminderMode: z.enum(REMINDER_MODES).default("none"),
  reminderDate: z.preprocess(blankToNull, isoDate.nullable()),
  reminderTime: z.preprocess(blankToNull, hm.nullable()),
  reminderMinutesBefore: z.preprocess(blankToNull, z.number().int().refine((n) => (REMINDER_BEFORE_OPTIONS as readonly number[]).includes(n), "Antelación no válida").nullable()),
}).superRefine((f, ctx) => {
  if (f.time && !f.dueDate) ctx.addIssue({ code: "custom", path: ["time"], message: "Para poner hora hace falta fecha." });
  if (f.reminderMode === "before" && !f.dueDate && f.repeat === "none") ctx.addIssue({ code: "custom", path: ["reminderMode"], message: "Para avisar antes, la tarea necesita una fecha." });
  if (f.reminderMode === "before" && f.reminderMinutesBefore == null) ctx.addIssue({ code: "custom", path: ["reminderMinutesBefore"], message: "Elige cuánto antes avisar." });
  if (f.reminderMode === "at_time" && (!f.reminderDate || !f.reminderTime)) ctx.addIssue({ code: "custom", path: ["reminderDate"], message: "Elige el día y la hora del recordatorio." });
});
export type TaskFields = z.input<typeof taskFieldsSchema>;
export type TaskFieldsParsed = z.output<typeof taskFieldsSchema>;

export const createTaskSchema = z.object({
  fields: taskFieldsSchema,
  subtasks: z.array(z.string().trim().min(1).max(300)).max(50, "Máximo 50 subtareas").default([]),
});

/** Primer error legible (para el formulario y las acciones). */
export const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Datos no válidos";

export type TaskRowLike = {
  title: string; notes: string | null; priority: number; due_date: string | null; due_time: string | null;
  business_id: string | null; goal_id: string | null; repeat: string; repeat_days: number[];
  reminder_mode: string; reminder_at: string | null; reminder_minutes_before: number | null;
};

/** Fila → campos del formulario (con las horas en la zona del usuario). */
export function taskToFields(t: TaskRowLike, timeZone: string): TaskFieldsParsed {
  const at = t.reminder_at ? nowLocal(new Date(t.reminder_at), timeZone) : null;
  return {
    title: t.title, notes: t.notes, priority: t.priority, dueDate: t.due_date, time: t.due_time?.slice(0, 5) ?? null,
    businessId: t.business_id, goalId: t.goal_id, repeat: t.repeat as Repeat, repeatDays: t.repeat_days ?? [],
    reminderMode: t.reminder_mode as ReminderMode, reminderDate: at?.date ?? null, reminderTime: at?.time ?? null,
    reminderMinutesBefore: t.reminder_minutes_before,
  };
}

/**
 * Campos validados → columnas. Como Antola: repetir sin fecha empieza hoy; «días concretos» sin días no se repite.
 */
export function fieldsToRow(f: TaskFieldsParsed, timeZone: string, now: Date = new Date()) {
  let dueDate = f.dueDate;
  let repeat: Repeat = f.repeat;
  const days = [...new Set(f.repeatDays)].sort();
  if (repeat === "weekdays" && days.length === 0) repeat = "none";
  if (repeat !== "none" && !dueDate) dueDate = nowLocal(now, timeZone).date;
  const time = dueDate ? f.time : null;
  const timing = computeTaskTiming({
    dueDate, time, reminderMode: f.reminderMode, reminderDate: f.reminderDate, reminderTime: f.reminderTime, reminderMinutesBefore: f.reminderMinutesBefore,
  }, timeZone);
  return {
    title: f.title, notes: f.notes, priority: f.priority, due_date: dueDate, due_time: time,
    business_id: f.businessId, goal_id: f.goalId, repeat, repeat_days: repeat === "weekdays" ? days : [],
    ...timingColumns(timing, now),
  };
}

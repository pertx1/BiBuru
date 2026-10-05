import { z } from "zod";
import { isoDate } from "@/lib/schemas";
import { parseRecurrence } from "./recurrence";

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optText = (max: number) => z.preprocess(emptyToUndef, z.string().trim().max(max).optional());
const optUuid = z.preprocess(emptyToUndef, z.uuid().nullish());
export const timeHM = z.preprocess(emptyToUndef, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida (HH:MM)").optional());
const optDate = z.preprocess(emptyToUndef, isoDate.optional());

const recurrenceField = z.preprocess(
  (v) => (v === null || v === undefined || v === "" ? undefined : v),
  z.unknown().optional().transform((v, ctx) => {
    if (v === undefined) return undefined;
    const r = parseRecurrence(v);
    if (!r) { ctx.addIssue({ code: "custom", message: "Repetición no válida" }); return z.NEVER; }
    return r;
  }),
);

export const taskSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1, "Escribe qué hay que hacer").max(200),
  notes: optText(5000),
  due_date: optDate,
  due_time: timeHM,
  priority: z.coerce.number().int().min(0).max(3).default(0),
  business_id: optUuid,
  goal_id: optUuid,
  parent_id: optUuid,
  recurrence: recurrenceField,
  status: z.enum(["open", "done"]).default("open"),
}).refine((t) => !t.due_time || !!t.due_date, { message: "Para poner hora hace falta fecha", path: ["due_time"] });

export const eventSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1, "Pon un título").max(200),
  notes: optText(5000),
  location: optText(200),
  all_day: z.boolean().default(false),
  start_date: isoDate,
  start_time: timeHM,
  end_date: isoDate,
  end_time: timeHM,
  business_id: optUuid,
  recurrence: recurrenceField,
}).superRefine((e, ctx) => {
  if (e.end_date < e.start_date) ctx.addIssue({ code: "custom", message: "El fin no puede ser antes del inicio", path: ["end_date"] });
  if (!e.all_day) {
    if (!e.start_time || !e.end_time) ctx.addIssue({ code: "custom", message: "Indica hora de inicio y de fin", path: ["start_time"] });
    else if (e.end_date === e.start_date && e.end_time < e.start_time) ctx.addIssue({ code: "custom", message: "La hora de fin es anterior a la de inicio", path: ["end_time"] });
  }
});

export const GOAL_MEASURES = ["number", "euros", "percent", "milestones"] as const;
export const goalSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1, "Pon un título").max(200),
  description: optText(2000),
  business_id: optUuid,
  measure_type: z.enum(GOAL_MEASURES),
  target: z.preprocess(emptyToUndef, z.string().optional()),
  auto_source: z.preprocess(emptyToUndef, z.enum(["income", "profit", "tasks"]).optional()),
  period_start: optDate,
  deadline: optDate,
});

export type TaskInput = z.input<typeof taskSchema>;
export type EventInput = z.input<typeof eventSchema>;
export type GoalInput = z.input<typeof goalSchema>;

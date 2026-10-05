"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { nowLocal, zonedToUtc } from "@/lib/dates";
import type { ActionResult } from "@/lib/schemas";
import { getNow } from "@/lib/tasks/data";
import { parseQuickTask } from "@/lib/tasks/quick-parse";
import { REMINDER_PREFIX } from "@/lib/tasks/reminder-text";
import { snooze, type SnoozeOption } from "@/lib/tasks/snooze";

const uuid = z.uuid();
const refresh = () => { revalidatePath("/tareas"); revalidatePath("/"); };

/** «Recuérdame el viernes a las 9 pedir presupuesto» → recordatorio suelto (sin hora, a las 09:00). */
export async function createReminder(text: string): Promise<ActionResult & { when?: string }> {
  const t = z.string().trim().min(1).max(500).safeParse(text);
  if (!t.success) return { ok: false, error: "Escribe el recordatorio" };
  const { supabase, workspaceId, userId, timezone } = await getContext();
  const now = await getNow();
  const q = parseQuickTask(t.data.replace(REMINDER_PREFIX, ""), now.date, now.time);
  if (!q.date) return { ok: false, error: "Dime cuándo: por ejemplo «el viernes a las 9» o «mañana a las 10»." };
  const at = zonedToUtc(q.date, q.time ?? "09:00", timezone);
  if (at.getTime() < Date.now() - 60_000) return { ok: false, error: "Esa fecha ya pasó." };
  const { data, error } = await supabase.from("reminders").insert({ workspace_id: workspaceId, user_id: userId, title: q.title.slice(0, 200), remind_at: at.toISOString() }).select("id").single();
  if (error) { console.error("[reminders] create:", error.message); return { ok: false, error: "No se pudo crear el recordatorio" }; }
  refresh();
  return { ok: true, id: data.id, when: `${q.date} ${q.time ?? "09:00"}` };
}

export async function completeReminder(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Recordatorio no válido" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("reminders").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: "No se pudo guardar" };
  refresh();
  return { ok: true };
}

export async function snoozeReminder(id: string, option: SnoozeOption): Promise<ActionResult> {
  const p = z.object({ id: uuid, option: z.enum(["1h", "tarde", "manana", "semana"]) }).safeParse({ id, option });
  if (!p.success) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId, timezone } = await getContext();
  const { data: r } = await supabase.from("reminders").select("remind_at").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!r) return { ok: false, error: "No se encontró el recordatorio" };
  const now = await getNow();
  const cur = nowLocal(new Date(r.remind_at), timezone);
  const next = snooze(p.data.option, now, { date: cur.date, time: cur.time });
  const at = zonedToUtc(next.date!, next.time ?? cur.time, timezone);
  const { error } = await supabase.from("reminders").update({ remind_at: at.toISOString(), status: "snoozed", sent_at: null }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: "No se pudo posponer" };
  refresh();
  return { ok: true };
}

export async function deleteReminder(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Recordatorio no válido" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("reminders").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: "No se pudo eliminar" };
  refresh();
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import type { ActionResult } from "@/lib/schemas";
import { eventSchema, type EventInput } from "@/lib/tasks/schemas";

const refresh = () => { revalidatePath("/calendario"); revalidatePath("/"); };

/** Crea o actualiza un evento. Con un `id` que no existe lo crea (sirve para deshacer un borrado). */
export async function saveEvent(input: EventInput): Promise<ActionResult> {
  const p = eventSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos no válidos" };
  const { supabase, workspaceId, userId } = await getContext();
  const e = p.data;
  const row = {
    title: e.title, notes: e.notes ?? null, location: e.location ?? null, all_day: e.all_day,
    start_date: e.start_date, start_time: e.all_day ? null : (e.start_time ?? null), end_date: e.end_date, end_time: e.all_day ? null : (e.end_time ?? null),
    business_id: e.business_id ?? null, recurrence: e.recurrence ? { ...e.recurrence } : null,
  };
  if (e.id) {
    const { data: ex } = await supabase.from("events").select("id").eq("id", e.id).eq("workspace_id", workspaceId).maybeSingle();
    if (ex) {
      const { error } = await supabase.from("events").update(row).eq("id", e.id).eq("workspace_id", workspaceId);
      if (error) { console.error("[events] update:", error.message); return { ok: false, error: "No se pudo guardar." }; }
      refresh();
      return { ok: true, id: e.id };
    }
  }
  const { data, error } = await supabase.from("events").insert({ ...row, id: e.id, workspace_id: workspaceId, user_id: userId }).select("id").single();
  if (error) { console.error("[events] insert:", error.message); return { ok: false, error: "No se pudo guardar." }; }
  refresh();
  return { ok: true, id: data.id };
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Evento no válido" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("events").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) { console.error("[events] delete:", error.message); return { ok: false, error: "No se pudo eliminar." }; }
  refresh();
  return { ok: true };
}

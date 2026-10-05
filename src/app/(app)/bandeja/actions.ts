"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { captureSchema } from "@/lib/notes/schemas";
import type { ActionResult } from "@/lib/schemas";
import { getNow } from "@/lib/tasks/data";
import { parseQuickTask } from "@/lib/tasks/quick-parse";

const uuid = z.uuid();
const refresh = () => { revalidatePath("/bandeja"); revalidatePath("/tareas"); revalidatePath("/notas"); revalidatePath("/"); };

export type CaptureResult = { ok: true } | { ok: false; error: string; permanent: boolean };

/**
 * Recibe una captura (de la cola del dispositivo). Idempotente: reenviar el mismo `clientId` no duplica.
 * Nunca pierde: si la IA o cualquier otra cosa falla, la captura queda igualmente en la bandeja.
 */
export async function captureItem(input: z.input<typeof captureSchema>): Promise<CaptureResult> {
  const p = captureSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Captura no válida", permanent: true };
  const { supabase, workspaceId, userId } = await getContext();
  const { error } = await supabase.from("inbox_items").upsert(
    { workspace_id: workspaceId, user_id: userId, client_id: p.data.clientId, raw_text: p.data.text, source: p.data.source, captured_at: new Date(p.data.capturedAt).toISOString() },
    { onConflict: "workspace_id,client_id", ignoreDuplicates: true },
  );
  if (error) { console.error("[inbox] capture:", error.message); return { ok: false, error: "No se pudo guardar", permanent: false }; }
  refresh();
  return { ok: true };
}

type Created = { kind: "task" | "note"; id: string };

async function markAccepted(id: string, created: Created) {
  const { supabase, workspaceId } = await getContext();
  await supabase.from("inbox_items").update({ status: "accepted", processed_at: new Date().toISOString(), proposal: { result: created } }).eq("id", id).eq("workspace_id", workspaceId);
}

/** Convierte una captura en tarea (entiende fechas: «llamar a Ana mañana a las 10»). */
export async function acceptInboxAsTask(id: string): Promise<ActionResult & { created?: Created }> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Captura no válida" };
  const { supabase, workspaceId, userId } = await getContext();
  const { data: item } = await supabase.from("inbox_items").select("raw_text, status").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!item) return { ok: false, error: "No se encontró la captura" };
  const now = await getNow();
  const q = parseQuickTask(item.raw_text, now.date, now.time);
  const { data, error } = await supabase.from("tasks").insert({
    workspace_id: workspaceId, user_id: userId, title: q.title.slice(0, 200), due_date: q.date, due_time: q.time, priority: q.priority, recurrence: q.recurrence ? { ...q.recurrence } : null,
  }).select("id").single();
  if (error) { console.error("[inbox] task:", error.message); return { ok: false, error: "No se pudo crear la tarea" }; }
  const created = { kind: "task" as const, id: data.id };
  await markAccepted(id, created);
  refresh();
  return { ok: true, id: data.id, created };
}

/** Convierte una captura en nota (primera línea = título). */
export async function acceptInboxAsNote(id: string): Promise<ActionResult & { created?: Created }> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Captura no válida" };
  const { supabase, workspaceId, userId } = await getContext();
  const { data: item } = await supabase.from("inbox_items").select("raw_text").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!item) return { ok: false, error: "No se encontró la captura" };
  const [first, ...rest] = item.raw_text.split("\n");
  const long = first.length > 80;
  const { data, error } = await supabase.from("notes").insert({
    workspace_id: workspaceId, user_id: userId, title: long ? first.slice(0, 80) : first.trim(), body: long ? item.raw_text : rest.join("\n").trim(),
  }).select("id").single();
  if (error) { console.error("[inbox] note:", error.message); return { ok: false, error: "No se pudo crear la nota" }; }
  const created = { kind: "note" as const, id: data.id };
  await markAccepted(id, created);
  refresh();
  return { ok: true, id: data.id, created };
}

export async function discardInbox(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Captura no válida" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("inbox_items").update({ status: "discarded", processed_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: "No se pudo descartar" };
  refresh();
  return { ok: true };
}

/** Deshace aceptar o descartar: la captura vuelve a la bandeja y se borra lo que se hubiera creado. */
export async function restoreInbox(id: string, created?: Created): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Captura no válida" };
  const { supabase, workspaceId } = await getContext();
  if (created && uuid.safeParse(created.id).success) {
    await supabase.from(created.kind === "task" ? "tasks" : "notes").delete().eq("id", created.id).eq("workspace_id", workspaceId);
  }
  const { error } = await supabase.from("inbox_items").update({ status: "pending", processed_at: null, proposal: null }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: "No se pudo restaurar" };
  refresh();
  return { ok: true };
}

export async function editInboxText(id: string, text: string): Promise<ActionResult> {
  const p = z.object({ id: uuid, text: z.string().trim().min(1).max(10000) }).safeParse({ id, text });
  if (!p.success) return { ok: false, error: "Texto no válido" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("inbox_items").update({ raw_text: p.data.text }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: "No se pudo guardar" };
  refresh();
  return { ok: true };
}

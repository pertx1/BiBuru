"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createTask } from "@/app/(app)/tareas/actions";
import { getContext } from "@/lib/context";
import type { ActionResult } from "@/lib/schemas";

const uuid = z.uuid();
const refresh = () => { revalidatePath("/proyectos", "layout"); revalidatePath("/favoritos"); };

/** Tarea rápida dentro de un proyecto (sin fecha; luego se edita en Tareas). */
export async function addProjectTask(categoryId: string, title: string): Promise<ActionResult> {
  const t = z.string().trim().min(1, "Escribe la tarea").max(300).safeParse(title);
  if (!uuid.safeParse(categoryId).success || !t.success) return { ok: false, error: t.error?.issues[0]?.message ?? "Datos no válidos" };
  const r = await createTask({ fields: { title: t.data, categoryId, notes: null, dueDate: null, time: null, businessId: null, goalId: null, reminderDate: null, reminderTime: null, reminderMinutesBefore: null } });
  refresh();
  return r.ok ? { ok: true, id: r.id } : { ok: false, error: r.error };
}

/** Nota nueva dentro del proyecto; se abre para escribirla. */
export async function addProjectNote(categoryId: string, title = ""): Promise<ActionResult> {
  if (!uuid.safeParse(categoryId).success) return { ok: false, error: "Datos no válidos" };
  const t = z.string().trim().max(200).safeParse(title);
  const { supabase, workspaceId, userId } = await getContext();
  const { data, error } = await supabase.from("notes").insert({ workspace_id: workspaceId, user_id: userId, category_id: categoryId, title: t.success ? t.data : "" }).select("id").single();
  if (error) return { ok: false, error: "No se pudo crear la nota" };
  refresh(); revalidatePath("/notas");
  return { ok: true, id: data.id };
}

/** Descripción del proyecto («para qué es, en qué punto está»). */
export async function saveProjectDescription(categoryId: string, description: string): Promise<ActionResult> {
  const d = z.string().trim().max(500).safeParse(description);
  if (!uuid.safeParse(categoryId).success || !d.success) return { ok: false, error: "Máximo 500 caracteres" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("video_categories").update({ description: d.data || null }).eq("id", categoryId).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: "No se pudo guardar" };
  refresh();
  return { ok: true };
}

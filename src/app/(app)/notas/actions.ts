"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { folderSchema, noteSchema, tagNameSchema, TAG_COLORS, type NoteInput } from "@/lib/notes/schemas";
import type { Tag } from "@/lib/notes/data";
import type { ActionResult } from "@/lib/schemas";

const uuid = z.uuid();
const refresh = () => { revalidatePath("/notas"); revalidatePath("/bandeja"); revalidatePath("/"); };
const fail = (op: string, e: { message: string; code?: string }): ActionResult => {
  console.error(`[notes] ${op}:`, e.message);
  if (e.message.includes("subcarpetas") || e.message.includes("sí misma")) return { ok: false, error: "No se puede mover una carpeta dentro de sí misma." };
  return { ok: false, error: "No se pudo guardar. Inténtalo de nuevo." };
};

// -------------------------------------------------------------------- notas
/** Crea o actualiza. Con un `id` nuevo la crea (sirve para deshacer un borrado y para autoguardado). */
export async function saveNote(input: NoteInput): Promise<ActionResult> {
  const p = noteSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos no válidos" };
  const { supabase, workspaceId, userId } = await getContext();
  const n = p.data;
  const row = { title: n.title, body: n.body, pinned: n.pinned, folder_id: n.folder_id ?? null, business_id: n.business_id ?? null };
  if (n.id) {
    const { data: ex } = await supabase.from("notes").select("id").eq("id", n.id).eq("workspace_id", workspaceId).maybeSingle();
    if (ex) {
      const { error } = await supabase.from("notes").update(row).eq("id", n.id).eq("workspace_id", workspaceId);
      if (error) return fail("update", error);
      return { ok: true, id: n.id };
    }
  }
  const { data, error } = await supabase.from("notes").insert({ ...row, id: n.id, workspace_id: workspaceId, user_id: userId }).select("id").single();
  if (error) return fail("insert", error);
  refresh();
  return { ok: true, id: data.id };
}

export async function createNote(folderId?: string | null, businessId?: string | null): Promise<ActionResult> {
  return saveNote({ title: "", body: "", folder_id: folderId ?? null, business_id: businessId ?? null });
}

export async function setNotePinned(id: string, pinned: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Nota no válida" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("notes").update({ pinned }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return fail("pin", error);
  refresh();
  return { ok: true };
}

export async function moveNote(id: string, folderId: string | null): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || (folderId !== null && !uuid.safeParse(folderId).success)) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("notes").update({ folder_id: folderId }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return fail("move", error);
  refresh();
  return { ok: true };
}

export async function deleteNote(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Nota no válida" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("notes").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return fail("delete", error);
  refresh();
  return { ok: true };
}

// ----------------------------------------------------------------- carpetas
export async function saveFolder(input: z.input<typeof folderSchema>): Promise<ActionResult> {
  const p = folderSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos no válidos" };
  const { supabase, workspaceId, userId } = await getContext();
  const f = p.data;
  const { data: last } = await supabase.from("folders").select("sort_order").eq("workspace_id", workspaceId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  if (f.id) {
    const { data: ex } = await supabase.from("folders").select("id").eq("id", f.id).eq("workspace_id", workspaceId).maybeSingle();
    if (ex) {
      const { error } = await supabase.from("folders").update({ name: f.name, parent_id: f.parent_id ?? null }).eq("id", f.id).eq("workspace_id", workspaceId);
      if (error) return fail("folder.update", error);
      refresh();
      return { ok: true, id: f.id };
    }
  }
  const { data, error } = await supabase.from("folders").insert({ id: f.id, name: f.name, parent_id: f.parent_id ?? null, sort_order: (last?.sort_order ?? 0) + 1, workspace_id: workspaceId, user_id: userId }).select("id").single();
  if (error) return fail("folder.insert", error);
  refresh();
  return { ok: true, id: data.id };
}

export async function moveFolder(id: string, parentId: string | null): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || (parentId !== null && !uuid.safeParse(parentId).success)) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("folders").update({ parent_id: parentId }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return fail("folder.move", error);
  refresh();
  return { ok: true };
}

/** Borra la carpeta: sus subcarpetas suben un nivel y sus notas y tareas quedan sin carpeta (no se pierde nada). */
export async function deleteFolder(id: string): Promise<ActionResult & { parentId?: string | null }> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Carpeta no válida" };
  const { supabase, workspaceId } = await getContext();
  const { data: f } = await supabase.from("folders").select("parent_id").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!f) return { ok: false, error: "No se encontró la carpeta" };
  const up = await supabase.from("folders").update({ parent_id: f.parent_id }).eq("parent_id", id).eq("workspace_id", workspaceId);
  if (up.error) return fail("folder.reparent", up.error);
  const { error } = await supabase.from("folders").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return fail("folder.delete", error);
  refresh();
  return { ok: true, parentId: f.parent_id };
}

// ---------------------------------------------------------------- etiquetas
/** Añade una etiqueta (la crea si no existe, sin distinguir mayúsculas) a una nota, tarea o vídeo. */
export async function addTag(itemType: "note" | "task" | "video", itemId: string, name: string): Promise<ActionResult & { tag?: Tag }> {
  const p = z.object({ itemType: z.enum(["note", "task", "video"]), itemId: uuid, name: tagNameSchema }).safeParse({ itemType, itemId, name });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Etiqueta no válida" };
  const { supabase, workspaceId, userId } = await getContext();
  let { data: tag } = await supabase.from("tags").select("*").eq("workspace_id", workspaceId).ilike("name", p.data.name.replace(/[%_\\]/g, (c) => `\\${c}`)).maybeSingle();
  if (!tag) {
    const { count } = await supabase.from("tags").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
    const ins = await supabase.from("tags").insert({ workspace_id: workspaceId, user_id: userId, name: p.data.name, color: TAG_COLORS[(count ?? 0) % TAG_COLORS.length] }).select("*").single();
    if (ins.error) return fail("tag.insert", ins.error);
    tag = ins.data;
  }
  const { error } = await supabase.from("taggings").upsert(
    { workspace_id: workspaceId, user_id: userId, tag_id: tag.id, item_type: p.data.itemType, item_id: p.data.itemId }, { onConflict: "tag_id,item_type,item_id", ignoreDuplicates: true },
  );
  if (error) return fail("tagging", error);
  refresh();
  return { ok: true, tag };
}

export async function removeTag(itemType: "note" | "task" | "video", itemId: string, tagId: string): Promise<ActionResult> {
  const p = z.object({ itemType: z.enum(["note", "task", "video"]), itemId: uuid, tagId: uuid }).safeParse({ itemType, itemId, tagId });
  if (!p.success) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("taggings").delete().eq("workspace_id", workspaceId).eq("tag_id", tagId).eq("item_type", itemType).eq("item_id", itemId);
  if (error) return fail("untag", error);
  refresh();
  return { ok: true };
}

export async function deleteTag(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Etiqueta no válida" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("tags").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return fail("tag.delete", error);
  refresh();
  return { ok: true };
}

/** Carpetas y etiquetas para el detalle de una tarea (se cargan al abrirlo). */
export async function loadTaskMeta(taskId: string) {
  if (!uuid.safeParse(taskId).success) return null;
  const [{ listFolders, listTags, tagsOf }, { getContext: ctx }] = await Promise.all([import("@/lib/notes/data"), import("@/lib/context")]);
  const { supabase, workspaceId } = await ctx();
  const [folders, allTags, mine, task] = await Promise.all([
    listFolders(), listTags(), tagsOf("task", [taskId]),
    supabase.from("tasks").select("folder_id").eq("id", taskId).eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  return { folders: folders.map((f) => ({ id: f.id, name: f.name, parent_id: f.parent_id })), allTags: allTags.map((t) => ({ id: t.id, name: t.name, color: t.color })), tags: (mine.get(taskId) ?? []).map((t) => ({ id: t.id, name: t.name, color: t.color })), folderId: task.data?.folder_id ?? null };
}

export async function setTaskFolder(taskId: string, folderId: string | null): Promise<ActionResult> {
  if (!uuid.safeParse(taskId).success || (folderId !== null && !uuid.safeParse(folderId).success)) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("tasks").update({ folder_id: folderId }).eq("id", taskId).eq("workspace_id", workspaceId);
  if (error) return fail("task.folder", error);
  revalidatePath("/tareas");
  return { ok: true };
}

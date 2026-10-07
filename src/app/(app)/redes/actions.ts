"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { zonedToUtc } from "@/lib/dates";
import { SOCIAL_BUCKET, STORAGE_LIMIT_BYTES } from "@/lib/social/service";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/schemas";
import { tiktokModeFor } from "@/lib/social/tiktok-mode";

const uuid = z.uuid();
const refresh = () => { revalidatePath("/redes"); revalidatePath("/calendario"); revalidatePath("/"); };
const MIME = ["image/jpeg", "image/png", "video/mp4", "video/quicktime"] as const;
const MAX_FILE = 50 * 1024 * 1024;

/** Crea un borrador vacío (los archivos se suben a su carpeta). Opcionalmente a partir de un vídeo de Favoritos. */
export async function createDraft(o: { videoId?: string } = {}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { supabase, workspaceId, userId } = await getContext();
  let seed: { title?: string; caption?: string; notes?: string; source_video_id?: string; business_id?: string | null } = {};
  if (o.videoId && uuid.safeParse(o.videoId).success) {
    const { data: v } = await supabase.from("saved_videos").select("id, title, url, summary, actions, notes, business_id").eq("id", o.videoId).eq("workspace_id", workspaceId).maybeSingle();
    if (v) {
      const actions = Array.isArray(v.actions) ? (v.actions as string[]) : [];
      seed = {
        title: `Idea: ${v.title}`.slice(0, 120), source_video_id: v.id, business_id: v.business_id,
        notes: [`Idea sacada de: ${v.url}`, v.summary ?? "", actions.length ? `Ideas:\n${actions.map((a) => `- ${a}`).join("\n")}` : "", v.notes ? `Mis notas:\n${v.notes}` : ""].filter(Boolean).join("\n\n").slice(0, 5000),
      };
    }
  }
  const { data, error } = await supabase.from("social_posts").insert({ workspace_id: workspaceId, user_id: userId, ...seed }).select("id").single();
  if (error) return { ok: false, error: "No se pudo crear el borrador" };
  refresh();
  return { ok: true, id: data.id };
}

const postSchema = z.object({
  id: uuid, title: z.string().trim().max(120).optional(), caption: z.string().max(2200), hashtags: z.string().max(1000),
  mediaKind: z.enum(["image", "carousel", "reel", "video"]), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")), accountIds: z.array(uuid).max(10), schedule: z.boolean(), businessId: uuid.nullable().optional(), notes: z.string().max(5000).optional(),
});

/** Guarda la publicación. «Programar» exige fecha, al menos una red y algún archivo; «Borrador» no exige nada. */
export async function savePost(input: z.input<typeof postSchema>): Promise<ActionResult> {
  const p = postSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Revisa los datos de la publicación" };
  const d = p.data;
  const { supabase, workspaceId, userId, timezone } = await getContext();
  const { data: post } = await supabase.from("social_posts").select("id, status").eq("id", d.id).eq("workspace_id", workspaceId).maybeSingle();
  if (!post) return { ok: false, error: "Publicación no encontrada" };
  if (post.status === "publicando" || post.status === "publicada") return { ok: false, error: "Ya se está publicando o está publicada: no se puede cambiar." };
  const scheduled = d.date ? zonedToUtc(d.date, d.time || "10:00", timezone).toISOString() : null;
  if (d.schedule) {
    if (!scheduled) return { ok: false, error: "Elige fecha y hora" };
    if (!d.accountIds.length) return { ok: false, error: "Elige al menos una cuenta" };
    const { count } = await supabase.from("social_post_files").select("id", { count: "exact", head: true }).eq("post_id", d.id).is("deleted_at", null);
    if (!count) return { ok: false, error: "Añade al menos una foto o un vídeo" };
    if (d.mediaKind === "carousel" && count < 2) return { ok: false, error: "Un carrusel necesita al menos 2 archivos" };
  }
  const { error } = await supabase.from("social_posts").update({
    title: d.title || null, caption: d.caption, hashtags: d.hashtags, media_kind: d.mediaKind, scheduled_at: scheduled, status: d.schedule ? "programada" : "borrador",
    business_id: d.businessId ?? null, ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
  }).eq("id", d.id).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: "No se pudo guardar" };
  // Redes de destino: se quitan las que ya no están y se añaden las nuevas (con el mejor modo disponible en TikTok).
  const { data: accounts } = await supabase.from("social_accounts").select("id, platform, scopes").eq("workspace_id", workspaceId).in("id", d.accountIds.length ? d.accountIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: existing } = await supabase.from("social_post_targets").select("id, account_id").eq("post_id", d.id);
  const keep = new Set((accounts ?? []).map((a) => a.id));
  const drop = (existing ?? []).filter((t) => !keep.has(t.account_id)).map((t) => t.id);
  if (drop.length) await supabase.from("social_post_targets").delete().in("id", drop);
  const have = new Set((existing ?? []).map((t) => t.account_id));
  const add = (accounts ?? []).filter((a) => !have.has(a.id)).map((a) => ({ workspace_id: workspaceId, user_id: userId, post_id: d.id, account_id: a.id, mode: a.platform === "tiktok" ? tiktokModeFor(a.scopes) : "direct" }));
  if (add.length) await supabase.from("social_post_targets").insert(add);
  // Reprogramar reinicia los intentos.
  if (d.schedule) await supabase.from("social_post_targets").update({ status: "pendiente", attempts: 0, next_try_at: null, error: null, container_id: null }).eq("post_id", d.id).in("status", ["pendiente", "error"]);
  refresh();
  return { ok: true };
}

/** Cambiar solo la fecha (arrastrar en el Calendario): mantiene la hora. */
export async function reschedulePost(id: string, date: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId, timezone } = await getContext();
  const { data: post } = await supabase.from("social_posts").select("scheduled_at, status").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!post) return { ok: false, error: "Publicación no encontrada" };
  if (post.status === "publicando" || post.status === "publicada") return { ok: false, error: "Ya está publicada" };
  const time = post.scheduled_at ? new Date(post.scheduled_at).toLocaleTimeString("es-ES", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "10:00";
  const { error } = await supabase.from("social_posts").update({ scheduled_at: zonedToUtc(date, time, timezone).toISOString() }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: "No se pudo mover" };
  refresh();
  return { ok: true };
}

/** Antes de subir: comprueba tamaño, tipo y el espacio total. Devuelve la ruta donde subirlo (carpeta del espacio). */
export async function prepareSocialUpload(postId: string, file: { name: string; size: number; mime: string }): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const p = z.object({ postId: uuid, size: z.number().int().min(1).max(MAX_FILE), mime: z.enum(MIME) }).safeParse({ postId, size: file.size, mime: file.mime });
  if (!p.success) return { ok: false, error: file.size > MAX_FILE ? "El archivo pasa de 50 MB." : "Formato no válido: JPG, PNG, MP4 o MOV." };
  const { supabase, workspaceId } = await getContext();
  const { data: files } = await supabase.from("social_post_files").select("size_bytes").eq("workspace_id", workspaceId).is("deleted_at", null).limit(5000);
  const used = (files ?? []).reduce((s, f) => s + Number(f.size_bytes), 0);
  if (used + file.size > STORAGE_LIMIT_BYTES) return { ok: false, error: "No queda espacio para archivos (máx. 500 MB). Borra borradores antiguos o espera a que se limpien los ya publicados." };
  const ext = { "image/jpeg": "jpg", "image/png": "png", "video/mp4": "mp4", "video/quicktime": "mov" }[p.data.mime];
  return { ok: true, path: `${workspaceId}/${postId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}` };
}

export async function registerSocialFile(input: { postId: string; path: string; mime: string; size: number }): Promise<ActionResult> {
  const p = z.object({ postId: uuid, path: z.string().max(300), mime: z.enum(MIME), size: z.number().int().min(1).max(MAX_FILE) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId, userId } = await getContext();
  if (!p.data.path.startsWith(`${workspaceId}/${p.data.postId}/`)) return { ok: false, error: "Ruta no válida" };
  const { count } = await supabase.from("social_post_files").select("id", { count: "exact", head: true }).eq("post_id", p.data.postId).is("deleted_at", null);
  if ((count ?? 0) >= 10) return { ok: false, error: "Máximo 10 archivos por publicación" };
  const { error } = await supabase.from("social_post_files").insert({ workspace_id: workspaceId, user_id: userId, post_id: p.data.postId, path: p.data.path, mime: p.data.mime, size_bytes: p.data.size, position: count ?? 0 });
  if (error) return { ok: false, error: "No se pudo guardar el archivo" };
  refresh();
  return { ok: true };
}

export async function deleteSocialFile(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId } = await getContext();
  const { data: f } = await supabase.from("social_post_files").select("path").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!f) return { ok: false, error: "No encontrado" };
  await supabase.storage.from(SOCIAL_BUCKET).remove([f.path]);
  await supabase.from("social_post_files").delete().eq("id", id).eq("workspace_id", workspaceId);
  refresh();
  return { ok: true };
}

export async function deletePost(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId } = await getContext();
  const { data: files } = await supabase.from("social_post_files").select("path").eq("post_id", id).eq("workspace_id", workspaceId).is("deleted_at", null);
  if (files?.length) await supabase.storage.from(SOCIAL_BUCKET).remove(files.map((f) => f.path));
  const { error } = await supabase.from("social_posts").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: "No se pudo borrar" };
  refresh();
  return { ok: true };
}

/** Reintentar una red que dio error (vuelve a la cola ahora). */
export async function retryTarget(targetId: string): Promise<ActionResult> {
  if (!uuid.safeParse(targetId).success) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId } = await getContext();
  const { data: t } = await supabase.from("social_post_targets").update({ status: "pendiente", attempts: 0, next_try_at: null, error: null, container_id: null }).eq("id", targetId).eq("workspace_id", workspaceId).select("post_id").maybeSingle();
  if (!t) return { ok: false, error: "No encontrado" };
  await supabase.from("social_posts").update({ status: "programada" }).eq("id", t.post_id).eq("workspace_id", workspaceId).in("status", ["error", "publicando"]);
  refresh();
  return { ok: true };
}

export async function setSocialAccountBusiness(accountId: string, businessId: string | null): Promise<ActionResult> {
  if (!uuid.safeParse(accountId).success || (businessId && !uuid.safeParse(businessId).success)) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("social_accounts").update({ business_id: businessId }).eq("id", accountId).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: "No se pudo guardar" };
  refresh();
  return { ok: true };
}

/** Desconectar: borra la cuenta, su token y sus estadísticas guardadas (en la red no cambia nada). */
export async function disconnectSocialAccount(accountId: string): Promise<ActionResult> {
  if (!uuid.safeParse(accountId).success) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("social_accounts").delete().eq("id", accountId).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: "No se pudo desconectar" };
  refresh();
  return { ok: true };
}

/** «Actualizar estadísticas ahora». */
export async function refreshSocialStats(accountId: string): Promise<ActionResult> {
  if (!uuid.safeParse(accountId).success) return { ok: false, error: "Datos no válidos" };
  const { workspaceId } = await getContext();
  const admin = createAdminClient();
  const { data: acc } = await admin.from("social_accounts").select("id, workspace_id, user_id, platform, external_id, access_token_enc, refresh_token_enc, token_expires_at, refresh_expires_at, status, last_snapshot_on, created_at, updated_at").eq("id", accountId).eq("workspace_id", workspaceId).maybeSingle();
  if (!acc) return { ok: false, error: "No encontrado" };
  await import("@/lib/social/tiktok-service");
  const { snapshotAccount } = await import("@/lib/social/service");
  await snapshotAccount(admin, acc);
  refresh();
  return { ok: true };
}

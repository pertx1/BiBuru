"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createNote, createTask, type Actor } from "@/lib/ai/actors";
import { hasGeminiKey } from "@/lib/ai/gemini";
import { getContext } from "@/lib/context";
import { addVideoByUrl, adminVideoContext, analyzeSoon, analyzeVideo, estimateVideoCost, syncPlaylistFeed, syncYoutube, type FeedRow } from "@/lib/favorites/service";
import { allUrls } from "@/lib/favorites/url";
import { getBudget } from "@/lib/ai/run";
import { microsToEuros } from "@/lib/ai/pricing";
import { parsePlaylistId } from "@/lib/favorites/rss";
import { myPlaylists, refreshAccessToken } from "@/lib/favorites/youtube";
import { decryptSecret } from "@/lib/favorites/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/schemas";

const uuid = z.uuid();
const STATUSES = ["por_ver", "visto", "aplicado", "archivado"] as const;
const refresh = () => { revalidatePath("/favoritos"); revalidatePath("/"); };
const actorOf = async (): Promise<Actor> => { const c = await getContext(); return { supabase: c.supabase, workspaceId: c.workspaceId, userId: c.userId, timezone: c.timezone }; };

/** Guarda un enlace en Favoritos. El análisis se hace después, en segundo plano. */
export async function addVideo(url: string): Promise<ActionResult & { duplicate?: boolean }> {
  const text = z.string().trim().min(8).max(2000).safeParse(url);
  if (!text.success) return { ok: false, error: "Pega un enlace de vídeo" };
  const a = await actorOf();
  const r = await addVideoByUrl(a, text.data);
  if (!r.ok) return r;
  if (!r.duplicate && r.id && hasGeminiKey()) analyzeSoon(a.userId, a.workspaceId, r.id);
  refresh();
  return { ok: true, id: r.id, duplicate: r.duplicate };
}

/**
 * Pega uno o varios enlaces a la vez (también cortos de TikTok): se guardan sin duplicados y se analizan solos.
 * Devuelve cuántos son nuevos, repetidos, no disponibles (privados/borrados) o no válidos.
 */
export async function addVideos(text: string, note?: string): Promise<{ ok: true; added: number; duplicates: number; unavailable: number; invalid: number; firstId?: string } | { ok: false; error: string }> {
  const t = z.string().trim().min(8).max(20000).safeParse(text);
  const urls = t.success ? allUrls(t.data) : [];
  if (!urls.length) return { ok: false, error: "No hay ningún enlace (debe empezar por https://)" };
  const a = await actorOf();
  const out = { added: 0, duplicates: 0, unavailable: 0, invalid: 0, firstId: undefined as string | undefined };
  for (const u of urls) {
    const r = await addVideoByUrl(a, u);
    if (!r.ok) { out.invalid++; continue; }
    if (r.duplicate) { out.duplicates++; continue; }
    if (r.unavailable) { out.unavailable++; continue; }
    out.added++;
    out.firstId ??= r.id;
    const n = note?.trim().slice(0, 5000);
    if (n) await a.supabase.from("saved_videos").update({ notes: n }).eq("id", r.id).eq("workspace_id", a.workspaceId);
    if (r.id && hasGeminiKey()) analyzeSoon(a.userId, a.workspaceId, r.id);
  }
  refresh();
  return { ok: true, ...out };
}

// ------------------------------------------------------------------ análisis completo subiendo el vídeo
const MAX_UPLOAD = 50 * 1024 * 1024;
const VIDEO_MIME = ["video/mp4", "video/quicktime", "video/webm"] as const;

/** Coste estimado del análisis completo y lo que queda de presupuesto este mes (para enseñarlo antes de subir). */
export async function estimateFullAnalysis(id: string, durationSec: number): Promise<{ ok: true; costEur: number; remainingEur: number; fits: boolean } | { ok: false; error: string }> {
  const p = z.object({ id: uuid, d: z.number().min(1).max(36000) }).safeParse({ id, d: durationSec });
  if (!p.success) return { ok: false, error: "Datos no válidos" };
  if (!hasGeminiKey()) return { ok: false, error: "La IA no está configurada (falta GEMINI_API_KEY)." };
  const a = await actorOf();
  const ctx = await adminVideoContext(createAdminClient(), a.userId, a.workspaceId);
  if (!ctx) return { ok: false, error: "Perfil no encontrado" };
  const [cost, budget] = await Promise.all([estimateVideoCost(ctx, Math.ceil(p.data.d)), getBudget({ ...ctx, supabase: a.supabase })]);
  return { ok: true, costEur: microsToEuros(cost), remainingEur: microsToEuros(budget.remainingMicros), fits: cost <= budget.remainingMicros };
}

/** URL firmada de un solo uso para subir el vídeo directamente a Storage (no pasa por el servidor: límite de 4,5 MB de Vercel). */
export async function createVideoUpload(id: string, input: { size: number; mime: string; durationSec: number }): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  const p = z.object({ id: uuid, size: z.number().int().min(1).max(MAX_UPLOAD), mime: z.enum(VIDEO_MIME), durationSec: z.number().min(1).max(36000) }).safeParse({ id, ...input });
  if (!p.success) return { ok: false, error: input.size > MAX_UPLOAD ? "El vídeo pasa de 50 MB. Guárdalo con menos calidad o recórtalo." : "Formato no válido (MP4, MOV o WebM)." };
  const est = await estimateFullAnalysis(id, p.data.durationSec);
  if (!est.ok) return est;
  if (!est.fits) return { ok: false, error: "No queda presupuesto de IA este mes para analizar el vídeo completo." };
  const a = await actorOf();
  const { data: v } = await a.supabase.from("saved_videos").select("id").eq("id", id).eq("workspace_id", a.workspaceId).maybeSingle();
  if (!v) return { ok: false, error: "Vídeo no encontrado" };
  const ext = p.data.mime === "video/quicktime" ? "mov" : p.data.mime === "video/webm" ? "webm" : "mp4";
  const path = `${a.workspaceId}/${id}-${Date.now()}.${ext}`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("video-uploads").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "No se pudo preparar la subida" };
  await admin.from("saved_videos").update({ upload_duration_sec: Math.ceil(p.data.durationSec) }).eq("id", id).eq("workspace_id", a.workspaceId);
  return { ok: true, path: data.path, token: data.token };
}

/** Tras subir: lanza el análisis completo (el archivo se borra al terminar, salga bien o mal). */
export async function startFullAnalysis(id: string, path: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !z.string().max(300).safeParse(path).success) return { ok: false, error: "Datos no válidos" };
  const a = await actorOf();
  if (!path.startsWith(`${a.workspaceId}/${id}-`)) return { ok: false, error: "Subida no válida" };
  const { error } = await a.supabase.from("saved_videos").update({ upload_path: path, analysis_status: "pending", analysis_attempts: 0, analysis_error: null, analysis_next_try_at: null }).eq("id", id).eq("workspace_id", a.workspaceId);
  if (error) return { ok: false, error: "No se pudo empezar el análisis" };
  analyzeSoon(a.userId, a.workspaceId, id);
  refresh();
  return { ok: true };
}

export async function setVideoStatus(id: string, status: (typeof STATUSES)[number]): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !STATUSES.includes(status)) return { ok: false, error: "Datos no válidos" };
  const a = await actorOf();
  const { error } = await a.supabase.from("saved_videos").update({ status }).eq("id", id).eq("workspace_id", a.workspaceId);
  if (error) return { ok: false, error: "No se pudo cambiar el estado" };
  refresh();
  return { ok: true };
}

export async function updateVideo(id: string, patch: { category_id?: string | null; business_id?: string | null; notes?: string | null }): Promise<ActionResult> {
  const p = z.object({ id: uuid, category_id: uuid.nullable().optional(), business_id: uuid.nullable().optional(), notes: z.string().max(5000).nullable().optional() }).safeParse({ id, ...patch });
  if (!p.success) return { ok: false, error: "Datos no válidos" };
  const a = await actorOf();
  const { id: _id, ...rest } = p.data;
  void _id;
  const { error } = await a.supabase.from("saved_videos").update(rest).eq("id", id).eq("workspace_id", a.workspaceId);
  if (error) return { ok: false, error: "No se pudo guardar" };
  refresh();
  return { ok: true };
}

export async function deleteVideo(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Vídeo no válido" };
  const a = await actorOf();
  const { error } = await a.supabase.from("saved_videos").delete().eq("id", id).eq("workspace_id", a.workspaceId);
  if (error) return { ok: false, error: "No se pudo eliminar" };
  refresh();
  return { ok: true };
}

/** Confirma el análisis de un vídeo largo: completo (con coste) o ligero (solo texto, casi gratis). */
export async function confirmAnalysis(id: string, mode: "video" | "light"): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || (mode !== "video" && mode !== "light")) return { ok: false, error: "Datos no válidos" };
  if (!hasGeminiKey()) return { ok: false, error: "La IA no está configurada (falta GEMINI_API_KEY)." };
  const a = await actorOf();
  const admin = createAdminClient();
  const ctx = await adminVideoContext(admin, a.userId, a.workspaceId);
  if (!ctx) return { ok: false, error: "Perfil no encontrado" };
  const { data: v } = await a.supabase.from("saved_videos").select("id").eq("id", id).eq("workspace_id", a.workspaceId).maybeSingle();
  if (!v) return { ok: false, error: "Vídeo no encontrado" };
  await admin.from("saved_videos").update({ analysis_status: "pending", analysis_attempts: 0 }).eq("id", id).eq("workspace_id", a.workspaceId);
  const r = await analyzeVideo(ctx, id, { mode, confirmed: true });
  refresh();
  if (r === "ready") return { ok: true };
  return { ok: false, error: r === "blocked" ? "La IA está pausada o al límite ahora mismo; se reintentará sola." : "No se pudo analizar ahora. Se reintentará sola." };
}

/** Vuelve a poner un vídeo en la cola de análisis (tras un error). */
export async function retryAnalysis(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Vídeo no válido" };
  const a = await actorOf();
  const { error } = await a.supabase.from("saved_videos").update({ analysis_status: "pending", analysis_attempts: 0, analysis_error: null, analysis_next_try_at: null }).eq("id", id).eq("workspace_id", a.workspaceId);
  if (error) return { ok: false, error: "No se pudo reintentar" };
  if (hasGeminiKey()) analyzeSoon(a.userId, a.workspaceId, id);
  refresh();
  return { ok: true };
}

const videoRow = async (a: Actor, id: string) => (await a.supabase.from("saved_videos").select("*").eq("id", id).eq("workspace_id", a.workspaceId).maybeSingle()).data;

export async function videoToTask(id: string): Promise<ActionResult & { href?: string }> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Vídeo no válido" };
  const a = await actorOf();
  const v = await videoRow(a, id);
  if (!v) return { ok: false, error: "Vídeo no encontrado" };
  const actions = Array.isArray(v.actions) ? (v.actions as string[]) : [];
  try {
    const c = await createTask(a, { title: `Aplicar: ${v.title}`.slice(0, 200), business: v.business_id, notes: [v.url, ...actions.map((x) => `- ${x}`)].join("\n") });
    await a.supabase.from("saved_videos").update({ task_id: c.id }).eq("id", id).eq("workspace_id", a.workspaceId); // ya no sale en «Ideas sin convertir»
    refresh();
    return { ok: true, id: c.id, href: c.href };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "No se pudo crear la tarea" }; }
}

export async function videoToNote(id: string): Promise<ActionResult & { href?: string }> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Vídeo no válido" };
  const a = await actorOf();
  const v = await videoRow(a, id);
  if (!v) return { ok: false, error: "Vídeo no encontrado" };
  const points = Array.isArray(v.key_points) ? (v.key_points as string[]) : [];
  const actions = Array.isArray(v.actions) ? (v.actions as string[]) : [];
  const body = [`[${v.title}](${v.url})${v.channel ? ` · ${v.channel}` : ""}`, v.summary ?? "", points.length ? `## Puntos clave\n${points.map((x) => `- ${x}`).join("\n")}` : "", actions.length ? `## Ideas para aplicar\n${actions.map((x) => `- [ ] ${x}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
  try {
    const c = await createNote(a, { title: v.title.slice(0, 200), body, business: v.business_id, tags: ["vídeo"] });
    return { ok: true, id: c.id, href: c.href };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "No se pudo crear la nota" }; }
}

// ------------------------------------------------------------------ categorías
const catName = z.string().trim().min(1, "Escribe un nombre").max(60);

export async function renameCategory(id: string, name: string): Promise<ActionResult> {
  const n = catName.safeParse(name);
  if (!uuid.safeParse(id).success || !n.success) return { ok: false, error: n.error?.issues[0]?.message ?? "Datos no válidos" };
  const a = await actorOf();
  const { error } = await a.supabase.from("video_categories").update({ name: n.data }).eq("id", id).eq("workspace_id", a.workspaceId);
  if (error) return { ok: false, error: error.code === "23505" ? "Ya existe una categoría con ese nombre (puedes fusionarlas)" : "No se pudo renombrar" };
  refresh();
  return { ok: true };
}

export async function togglePinCategory(id: string, pinned: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Datos no válidos" };
  const a = await actorOf();
  const { error } = await a.supabase.from("video_categories").update({ pinned }).eq("id", id).eq("workspace_id", a.workspaceId);
  if (error) return { ok: false, error: "No se pudo cambiar" };
  refresh();
  return { ok: true };
}

/** Fusiona `from` dentro de `into`: mueve sus vídeos y borra la categoría vacía. */
export async function mergeCategories(from: string, into: string): Promise<ActionResult> {
  if (!uuid.safeParse(from).success || !uuid.safeParse(into).success || from === into) return { ok: false, error: "Elige dos categorías distintas" };
  const a = await actorOf();
  const m = await a.supabase.from("saved_videos").update({ category_id: into }).eq("category_id", from).eq("workspace_id", a.workspaceId);
  if (m.error) return { ok: false, error: "No se pudieron mover los vídeos" };
  await a.supabase.from("video_categories").delete().eq("id", from).eq("workspace_id", a.workspaceId);
  refresh();
  return { ok: true };
}

export async function createCategory(name: string): Promise<ActionResult> {
  const n = catName.safeParse(name);
  if (!n.success) return { ok: false, error: n.error.issues[0]?.message ?? "Nombre no válido" };
  const a = await actorOf();
  const { data, error } = await a.supabase.from("video_categories").insert({ workspace_id: a.workspaceId, user_id: a.userId, name: n.data }).select("id").single();
  if (error) return { ok: false, error: error.code === "23505" ? "Ya existe esa categoría" : "No se pudo crear" };
  refresh();
  return { ok: true, id: data.id };
}

// ------------------------------------------------------------------ YouTube
export async function syncYoutubeNow(): Promise<ActionResult & { added?: number }> {
  const a = await actorOf();
  const admin = createAdminClient();
  const { data: i } = await admin.from("integrations").select("user_id, workspace_id, sync_likes, sync_playlists, last_sync_at").eq("user_id", a.userId).eq("provider", "google").maybeSingle();
  if (!i) return { ok: false, error: "Conecta primero tu cuenta de Google en Ajustes" };
  const r = await syncYoutube(admin, i, { maxNew: 50 });
  refresh();
  revalidatePath("/ajustes");
  return r.error ? { ok: false, error: r.error } : { ok: true, added: r.added };
}

/** Listas de reproducción propias, para que elijas cuáles sincronizar. */
export async function loadPlaylists(): Promise<ActionResult & { playlists?: { id: string; title: string; count: number }[] }> {
  const a = await actorOf();
  const admin = createAdminClient();
  const { data } = await admin.from("integrations").select("refresh_token_enc").eq("user_id", a.userId).eq("provider", "google").maybeSingle();
  if (!data) return { ok: false, error: "Conecta primero tu cuenta de Google" };
  try {
    const token = await refreshAccessToken(decryptSecret(data.refresh_token_enc));
    return { ok: true, playlists: await myPlaylists(token) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "No se pudieron leer tus listas" }; }
}

const syncSchema = z.object({ sync_likes: z.boolean(), sync_playlists: z.array(z.object({ id: z.string().min(5).max(80), title: z.string().max(120) })).max(10) });
export async function saveSyncSettings(input: z.infer<typeof syncSchema>): Promise<ActionResult> {
  const p = syncSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Datos no válidos" };
  const a = await actorOf();
  const { error } = await a.supabase.from("integrations").update(p.data).eq("user_id", a.userId).eq("provider", "google");
  if (error) return { ok: false, error: "No se pudo guardar" };
  revalidatePath("/ajustes");
  return { ok: true };
}

export async function disconnectGoogle(): Promise<ActionResult> {
  const a = await actorOf();
  // Se retira también el permiso en Google (mejor esfuerzo) antes de borrar el token guardado.
  const { data: row } = await createAdminClient().from("integrations").select("refresh_token_enc").eq("user_id", a.userId).eq("provider", "google").maybeSingle();
  if (row) { try { await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: decryptSecret(row.refresh_token_enc) }), signal: AbortSignal.timeout(8000) }); } catch { /* si falla, igualmente se borra aquí */ } }
  const { error } = await a.supabase.from("integrations").delete().eq("user_id", a.userId).eq("provider", "google");
  if (error) return { ok: false, error: "No se pudo desconectar" };
  revalidatePath("/ajustes");
  return { ok: true };
}

export async function saveVideoLongMinutes(minutes: number): Promise<ActionResult> {
  const p = z.number().int().min(1).max(600).safeParse(minutes);
  if (!p.success) return { ok: false, error: "Entre 1 y 600 minutos" };
  const a = await actorOf();
  const { error } = await a.supabase.from("profiles").update({ video_long_minutes: p.data }).eq("user_id", a.userId);
  if (error) return { ok: false, error: "No se pudo guardar" };
  revalidatePath("/ajustes");
  return { ok: true };
}

// ------------------------------------------------------------------ listas de YouTube por RSS (sin Google Cloud)
const MAX_FEEDS = 10;

/** Tras comprobar una lista: analiza ya los primeros vídeos nuevos; el resto los recoge la cola. */
function analyzeNew(a: Actor, ids: string[]) {
  if (hasGeminiKey()) for (const id of ids.slice(0, 3)) analyzeSoon(a.userId, a.workspaceId, id);
}

export async function addPlaylistFeed(url: string): Promise<ActionResult & { added?: number }> {
  const text = z.string().trim().min(10).max(2000).safeParse(url);
  const playlistId = text.success ? parsePlaylistId(text.data) : null;
  if (!playlistId) return { ok: false, error: "Pega el enlace de una lista de YouTube (el que lleva «list=»)." };
  const a = await actorOf();
  const { count } = await a.supabase.from("youtube_feeds").select("id", { count: "exact", head: true }).eq("workspace_id", a.workspaceId);
  if ((count ?? 0) >= MAX_FEEDS) return { ok: false, error: `Como máximo ${MAX_FEEDS} listas.` };
  const { data, error } = await a.supabase.from("youtube_feeds").insert({ workspace_id: a.workspaceId, user_id: a.userId, playlist_id: playlistId }).select("id, workspace_id, user_id, playlist_id, title").single();
  if (error) return { ok: false, error: error.code === "23505" ? "Esa lista ya está añadida." : "No se pudo guardar la lista" };
  const r = await syncPlaylistFeed(createAdminClient(), data as FeedRow);
  analyzeNew(a, r.newIds);
  refresh();
  revalidatePath("/ajustes");
  // La lista queda guardada aunque YouTube falle ahora: se reintentará sola.
  return r.error ? { ok: false, error: `Lista guardada, pero: ${r.error}` } : { ok: true, added: r.added };
}

export async function removePlaylistFeed(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Datos no válidos" };
  const a = await actorOf();
  const { error } = await a.supabase.from("youtube_feeds").delete().eq("id", id).eq("workspace_id", a.workspaceId);
  if (error) return { ok: false, error: "No se pudo quitar" };
  revalidatePath("/ajustes");
  return { ok: true };
}

export async function checkPlaylistFeedsNow(): Promise<ActionResult & { added?: number }> {
  const a = await actorOf();
  const { data: feeds } = await a.supabase.from("youtube_feeds").select("id, workspace_id, user_id, playlist_id, title").eq("workspace_id", a.workspaceId).limit(MAX_FEEDS);
  if (!feeds?.length) return { ok: false, error: "Añade primero una lista" };
  const admin = createAdminClient();
  let added = 0;
  const errors: string[] = [];
  for (const f of feeds) {
    const r = await syncPlaylistFeed(admin, f);
    added += r.added;
    analyzeNew(a, r.newIds);
    if (r.error) errors.push(`${f.title}: ${r.error}`);
  }
  refresh();
  revalidatePath("/ajustes");
  return errors.length ? { ok: false, error: errors.join(" · ").slice(0, 400) } : { ok: true, added };
}

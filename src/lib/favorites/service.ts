import "server-only";
import { after } from "next/server";
import { addTagsTo, resolveBusiness, type Actor } from "@/lib/ai/actors";
import { AiBlockedError, priceFor, runAi, type AiContext } from "@/lib/ai/run";
import { rateLimitOf, videoErrorMessage } from "@/lib/ai/errors";
import { estimateVideoCostMicros, VIDEO_TOKENS_PER_SECOND_LOW } from "@/lib/ai/pricing";
import { geminiProvider, getModelNames } from "@/lib/ai/gemini";
import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { buildVideoPrompt, parseVideoAnalysis, pickCategory, videoAnalysisJsonSchema } from "./analysis";
import { decryptSecret } from "./crypto";
import { resolveTiktokShort, tiktokOembedStatus, youtubeOembed } from "./oembed";
import { FeedError, fetchPlaylistFeed } from "./rss";
import { classifyVideoUrl, firstUrl, hashtags, isTiktokImageHost } from "./url";
import { deleteGeminiFile, uploadGeminiFile } from "@/lib/ai/gemini";
import { GoogleError, likedPage, playlistPage, refreshAccessToken, videoDetails, type YtVideo } from "./youtube";

export type VideoMeta = { title?: string | null; channel?: string | null; thumbnail?: string | null; durationSec?: number | null; publishedAt?: string | null };
export type AddResult = { ok: true; id: string; duplicate: boolean; source: string; unavailable?: boolean } | { ok: false; error: string };

/** Guarda un enlace de vídeo en Favoritos (sin duplicados). El análisis lo hace la cola, no esta función. */
export async function addVideoByUrl(a: Actor, raw: string, o: { via?: "manual" | "youtube_like" | "youtube_playlist"; originList?: string; meta?: VideoMeta } = {}): Promise<AddResult> {
  const text = firstUrl(raw) ?? raw.trim();
  let ref = classifyVideoUrl(text);
  if (!ref) return { ok: false, error: "Eso no parece un enlace válido (debe empezar por https://)." };
  if (ref.source === "tiktok" && ref.short) {
    const full = await resolveTiktokShort(ref.url);
    if (full) ref = classifyVideoUrl(full) ?? ref;
  }

  // ¿Ya está? Primero por id del vídeo; después por URL.
  let dup = ref.externalId ? await a.supabase.from("saved_videos").select("id").eq("workspace_id", a.workspaceId).eq("source", ref.source).eq("external_id", ref.externalId).maybeSingle() : null;
  if (!dup?.data) dup = await a.supabase.from("saved_videos").select("id").eq("workspace_id", a.workspaceId).eq("url", ref.url).maybeSingle();
  if (dup?.data) return { ok: true, id: dup.data.id, duplicate: true, source: ref.source };

  let meta: VideoMeta = o.meta ?? {};
  let unavailable = false;
  if (!o.meta) {
    const oe = ref.source === "youtube" ? await youtubeOembed(ref.url) : ref.source === "tiktok" ? await tiktokOembedStatus(ref.url) : null;
    if (oe === "unavailable") unavailable = true;
    else if (oe) meta = { title: oe.title, channel: oe.author, thumbnail: oe.thumbnail };
  }
  const fallbackTitle = ref.source === "other" ? new URL(ref.url).hostname.replace(/^www\./, "") : ref.source === "tiktok" ? "Vídeo de TikTok" : "Vídeo de YouTube";
  const { data, error } = await a.supabase.from("saved_videos").insert({
    workspace_id: a.workspaceId, user_id: a.userId, source: ref.source, external_id: ref.externalId, url: ref.url,
    title: (meta.title ?? fallbackTitle).slice(0, 300), channel: meta.channel ?? null, thumbnail_url: meta.thumbnail ?? null,
    duration_sec: meta.durationSec ?? null, published_at: meta.publishedAt ?? null, added_via: o.via ?? "manual", origin_list: o.originList ?? null,
    // Privado o borrado: se guarda marcado y no entra en la cola de análisis.
    ...(unavailable ? { unavailable: true, analysis_status: "error", analysis_error: "Vídeo privado o borrado en TikTok: no se puede analizar." } : {}),
  }).select("id").single();
  if (error) {
    if (error.code === "23505") return { ok: true, id: "", duplicate: true, source: ref.source }; // carrera: ya existe
    return { ok: false, error: "No se pudo guardar el vídeo" };
  }
  return { ok: true, id: data.id, duplicate: false, source: ref.source, unavailable };
}

/** Portada de TikTok como imagen para el modelo (solo de sus servidores de imágenes, máx. 3 MB). */
export async function fetchCoverImage(url: string | null, f: typeof fetch = fetch): Promise<{ mimeType: string; data: string } | null> {
  if (!url || !isTiktokImageHost(url)) return null;
  const res = await f(url, { signal: AbortSignal.timeout(8000), redirect: "error" }).catch(() => null);
  const type = res?.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!res?.ok || !/^image\/(jpeg|png|webp|heic|heif)$/.test(type)) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0 || buf.length > 3 * 1024 * 1024) return null;
  return { mimeType: type, data: buf.toString("base64") };
}

// ------------------------------------------------------------------ token de Google (solo servidor)
async function accessTokenFor(admin: AdminClient, userId: string): Promise<string | null> {
  const { data } = await admin.from("integrations").select("refresh_token_enc").eq("user_id", userId).eq("provider", "google").maybeSingle();
  if (!data) return null;
  try {
    return await refreshAccessToken(decryptSecret(data.refresh_token_enc));
  } catch (e) {
    if (e instanceof GoogleError && e.revoked) await admin.from("integrations").update({ last_sync_error: "Google ha retirado el acceso: vuelve a conectar la cuenta." } as never).eq("user_id", userId).eq("provider", "google");
    return null;
  }
}

// ------------------------------------------------------------------ análisis
export type AnalyzeOutcome = "ready" | "needs_confirm" | "retry" | "blocked" | "rate_limited" | "queued" | "error" | "skipped";
/** Un análisis «en curso» más antiguo que esto se considera colgado y no bloquea a los demás. */
const LOCK_STALE_MS = 6 * 60_000;
const RETRY_MINUTES = [5, 15, 60];
const UNKNOWN_DURATION_ESTIMATE_SEC = 30 * 60;

type Ctx = AiContext & { videoLongMinutes: number };

/** Coste estimado (micro-€) de analizar un vídeo con el modelo de vídeo; para pedir confirmación. */
export async function estimateVideoCost(ctx: Pick<AiContext, "supabase" | "workspaceId" | "models">, durationSec: number | null): Promise<number> {
  return estimateVideoCostMicros(durationSec ?? UNKNOWN_DURATION_ESTIMATE_SEC, await priceFor(ctx, ctx.models.video), 1500, VIDEO_TOKENS_PER_SECOND_LOW);
}

/**
 * Analiza un vídeo guardado. YouTube se envía a Gemini por su URL; el resto (y el análisis «ligero») usan solo el texto
 * disponible (título, autor, descripción), y la ficha lo indica. Un vídeo largo no se analiza sin confirmación.
 */
export async function analyzeVideo(ctx: Ctx, videoId: string, o: { mode?: "video" | "light" | "upload"; confirmed?: boolean } = {}): Promise<AnalyzeOutcome> {
  const { supabase, workspaceId } = ctx;
  const { data: v } = await supabase.from("saved_videos").select("*").eq("id", videoId).eq("workspace_id", workspaceId).maybeSingle();
  if (!v || (v.analysis_status === "ready" && !o.mode && !v.upload_path) || v.analysis_status === "analyzing") return "skipped";
  // Un archivo subido pendiente manda: el análisis es del vídeo completo.
  if (v.upload_path && !o.mode) o = { ...o, mode: "upload" };
  if (v.unavailable && o.mode !== "upload") {
    // Privado o borrado: no se analiza por enlace (sí si la persona sube el archivo).
    await supabase.from("saved_videos").update({ analysis_status: "error", analysis_error: "Vídeo privado o borrado en TikTok: no se puede analizar por enlace. Puedes subir el archivo." }).eq("id", videoId).eq("workspace_id", workspaceId);
    return "error";
  }
  const save = (patch: Record<string, unknown>) => supabase.from("saved_videos").update(patch as never).eq("id", videoId).eq("workspace_id", workspaceId);
  const admin = createAdminClient();

  // Duración (si falta) y descripción, con el token de la persona. Cuesta 1 unidad de cuota de YouTube.
  let description: string | null = null;
  let duration = v.duration_sec;
  if (v.source === "youtube" && v.external_id) {
    const token = await accessTokenFor(admin, v.user_id);
    if (token) {
      const d = await videoDetails(token, [v.external_id]).catch(() => [] as YtVideo[]);
      if (d[0]) { description = d[0].description; if (duration == null) { duration = d[0].durationSec; await save({ duration_sec: duration }); } }
    }
  }

  const upload = o.mode === "upload" && !!v.upload_path;
  const textOnly = v.source !== "youtube" && !upload;
  const light = o.mode === "light";
  const isLong = !upload && !textOnly && !light && (duration == null ? false : duration > ctx.videoLongMinutes * 60);
  if (isLong && !o.confirmed) { await save({ analysis_status: "needs_confirm", analysis_error: null }); return "needs_confirm"; }

  // Se reclama el vídeo (nadie más lo analiza a la vez) y, si ya hay otro vídeo analizándose en este espacio, se
  // queda en la cola: varios vídeos a la vez superan el límite por minuto de Gemini (era el error al analizar varios).
  const claimed = await supabase.from("saved_videos").update({ analysis_status: "analyzing", analysis_attempts: v.analysis_attempts + 1 })
    .eq("id", videoId).eq("workspace_id", workspaceId).neq("analysis_status", "analyzing").select("id");
  if (!claimed.data?.length) return "skipped";
  const busy = await supabase.from("saved_videos").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId)
    .eq("analysis_status", "analyzing").neq("id", videoId).gt("updated_at", new Date(Date.now() - LOCK_STALE_MS).toISOString());
  if ((busy.count ?? 0) > 0) {
    await save({ analysis_status: "pending", analysis_attempts: v.analysis_attempts, analysis_error: null, analysis_next_try_at: null });
    return "queued";
  }

  let geminiFile: string | null = null;
  try {
    const a: Actor = { supabase, workspaceId, userId: v.user_id, timezone: ctx.timezone };
    const [biz, cats] = await Promise.all([
      supabase.from("businesses").select("name, description").eq("workspace_id", workspaceId).eq("archived", false).limit(30),
      supabase.from("video_categories").select("id, name").eq("workspace_id", workspaceId),
    ]);
    const useText = textOnly || light;
    const tags = v.source === "tiktok" ? hashtags(v.title) : [];
    const info = `${v.source === "tiktok" ? "Descripción" : "Título"}: ${v.title}\nAutor: ${v.channel ?? "desconocido"}\nEnlace: ${v.url}${description ? `\nDescripción: ${description}` : ""}${tags.length ? `\nHashtags: ${tags.map((t) => `#${t}`).join(" ")}` : ""}${v.notes ? `\nNota de la persona (tenla en cuenta): ${v.notes.slice(0, 1500)}` : ""}`;
    // TikTok sin vídeo: la portada va como imagen (oficial vía oEmbed; nunca se descarga el vídeo de TikTok).
    const cover = useText && v.source === "tiktok" ? await fetchCoverImage(v.thumbnail_url) : null;
    let parts: unknown[];
    if (upload) {
      const file = await admin.storage.from("video-uploads").download(v.upload_path!);
      if (file.error || !file.data) throw new Error("No se encontró el vídeo subido. Vuelve a subirlo.");
      const bytes = Buffer.from(await file.data.arrayBuffer());
      const mimeType = file.data.type || "video/mp4";
      if (bytes.length <= INLINE_VIDEO_MAX) parts = [{ inlineData: { mimeType, data: bytes.toString("base64") } }, { text: `Analiza este vídeo (lo que se ve y lo que se dice).\n${info}` }];
      else { const g = await uploadGeminiFile(bytes, mimeType); geminiFile = g.name; parts = [{ fileData: { fileUri: g.uri, mimeType } }, { text: `Analiza este vídeo (lo que se ve y lo que se dice).\n${info}` }]; }
    } else if (useText) parts = cover ? [{ text: `${info}\nTe adjunto la imagen de portada del vídeo.` }, { inlineData: cover }] : [{ text: info }];
    else parts = [{ fileData: { fileUri: v.url } }, { text: `Analiza este vídeo.\n${info}` }];
    const estimated = useText ? 0 : await estimateVideoCost(ctx, upload ? v.upload_duration_sec : duration);
    const res = await runAi(ctx, light ? "video_light" : useText ? "video_light" : "video", {
      model: useText ? ctx.models.fast : ctx.models.video,
      system: buildVideoPrompt({ businesses: biz.data ?? [], categories: (cats.data ?? []).map((c) => c.name), textOnly: useText, light, cover: !!cover }),
      // Margen amplio: en los modelos que «piensan», el pensamiento cuenta dentro de este tope y cortaba el JSON.
      contents: [{ role: "user", parts: parts as never }], jsonSchema: videoAnalysisJsonSchema(), temperature: 0.2, maxOutputTokens: 8192,
      ...(useText ? {} : { mediaResolution: "low" as const }),
    }, { estimatedMicros: estimated });
    const an = parseVideoAnalysis(res.text);
    if (!an) throw new Error("La IA no devolvió un análisis válido");

    const pick = pickCategory(an.category, cats.data ?? []);
    let categoryId = pick.id;
    if (!categoryId) {
      const ins = await supabase.from("video_categories").insert({ workspace_id: workspaceId, user_id: v.user_id, name: pick.name }).select("id").single();
      categoryId = ins.data?.id ?? (await supabase.from("video_categories").select("id").eq("workspace_id", workspaceId).ilike("name", pick.name).maybeSingle()).data?.id ?? null;
    }
    const b = await resolveBusiness(a, an.business);
    await save({
      analysis_status: "ready", analysis_mode: useText ? (light && !textOnly ? "light" : "text") : "video", analysis_error: null, analysis_next_try_at: null,
      analysis_basis: upload || !useText ? "video_completo" : cover ? "texto_portada" : "texto",
      analysis_cost_micros: v.analysis_cost_micros + res.costMicros, summary: an.summary, key_points: an.key_points as unknown as Json, actions: an.actions as unknown as Json,
      utility: an.utility, category_id: categoryId, business_id: b?.id ?? null, business_reason: b ? an.business_reason : null,
    });
    if (an.tags.length) await addTagsTo(a, "video", videoId, an.tags);
    if (upload) await dropUpload(admin, videoId, v.upload_path!);
    return "ready";
  } catch (e) {
    if (e instanceof AiBlockedError) {
      const wait = e.reason === "busy" ? 2 : e.reason === "blocked" ? 6 * 60 : 60;
      await save({ analysis_status: "pending", analysis_error: e.message.slice(0, 300), analysis_next_try_at: new Date(Date.now() + wait * 60_000).toISOString(), analysis_attempts: v.analysis_attempts });
      return "blocked";
    }
    // Límite de Gemini (429): vuelve a la cola con la espera que pide, sin gastar un intento.
    const rl = rateLimitOf(e);
    if (rl) {
      await save({ analysis_status: "pending", analysis_error: videoErrorMessage(e), analysis_next_try_at: new Date(Date.now() + rl.waitMs).toISOString(), analysis_attempts: v.analysis_attempts });
      return "rate_limited";
    }
    const attempts = v.analysis_attempts + 1;
    const msg = videoErrorMessage(e);
    if (attempts >= 4) {
      await save({ analysis_status: "error", analysis_error: msg, analysis_next_try_at: null });
      if (upload) await dropUpload(admin, videoId, v.upload_path!); // no se guarda el vídeo si no se puede analizar
      return "error";
    }
    await save({ analysis_status: "pending", analysis_error: msg, analysis_next_try_at: new Date(Date.now() + RETRY_MINUTES[attempts - 1] * 60_000).toISOString() });
    return "retry";
  } finally {
    if (geminiFile) await deleteGeminiFile(geminiFile).catch(() => {});
  }
}

/** Hasta este tamaño el vídeo va dentro de la petición (Gemini admite ~20 MB por petición; base64 ocupa un 33 % más). */
export const INLINE_VIDEO_MAX = 14 * 1024 * 1024;

/** Borra el archivo subido y la referencia (el vídeo solo se guarda mientras se analiza). */
async function dropUpload(admin: AdminClient, videoId: string, path: string) {
  await admin.storage.from("video-uploads").remove([path]).catch(() => null);
  await admin.from("saved_videos").update({ upload_path: null }).eq("id", videoId);
}

/** Contexto de IA de un usuario concreto, con la clave de servicio (cola en segundo plano). */
export async function adminVideoContext(admin: AdminClient, userId: string, workspaceId: string): Promise<Ctx | null> {
  const { data: p } = await admin.from("profiles").select("timezone, ai_monthly_budget_cents, video_long_minutes").eq("user_id", userId).maybeSingle();
  if (!p) return null;
  return { supabase: admin, workspaceId, userId, timezone: p.timezone, budgetCents: p.ai_monthly_budget_cents, provider: geminiProvider(), models: getModelNames(), videoLongMinutes: p.video_long_minutes };
}

/** Tras estos resultados se sigue con el siguiente de la cola; con los demás (límite, presupuesto, otro en curso) se para. */
const KEEP_GOING: AnalyzeOutcome[] = ["ready", "needs_confirm", "retry", "error", "skipped"];

/** Siguiente vídeo pendiente de un espacio cuya espera ya ha pasado (el más antiguo primero). */
async function nextDue(admin: AdminClient, workspaceId: string, skip: Set<string>) {
  const { data } = await admin.from("saved_videos").select("id, user_id").eq("workspace_id", workspaceId).eq("analysis_status", "pending")
    .or(`analysis_next_try_at.is.null,analysis_next_try_at.lte.${new Date().toISOString()}`).order("created_at").limit(skip.size + 1);
  return (data ?? []).find((r) => !skip.has(r.id)) ?? null;
}

/** Analiza un vídeo y luego el resto de la cola del espacio, de uno en uno, mientras quede tiempo. */
async function analyzeAndDrain(userId: string, workspaceId: string, videoId: string, budgetMs: number) {
  const started = Date.now();
  const admin = createAdminClient();
  const ctxs = new Map<string, Ctx | null>();
  const ctxFor = async (uid: string) => { if (!ctxs.has(uid)) ctxs.set(uid, await adminVideoContext(admin, uid, workspaceId)); return ctxs.get(uid)!; };
  const first = await ctxFor(userId);
  if (!first) return;
  const seen = new Set([videoId]);
  let r = await analyzeVideo(first, videoId);
  while (KEEP_GOING.includes(r) && Date.now() - started < budgetMs) {
    const next = await nextDue(admin, workspaceId, seen);
    if (!next) break;
    seen.add(next.id);
    const ctx = await ctxFor(next.user_id);
    if (!ctx) break;
    r = await analyzeVideo(ctx, next.id);
  }
}

/** Cola de cada espacio dentro de esta instancia: varios `analyzeSoon` de una misma petición van en fila, no a la vez. */
const chains = new Map<string, Promise<void>>();

/**
 * Lanza el análisis de un vídeo recién guardado una vez enviada la respuesta (no hace esperar a la persona).
 * Los vídeos se analizan DE UNO EN UNO por espacio: Gemini corta con 429 si le llegan varios vídeos a la vez.
 */
export function analyzeSoon(userId: string, workspaceId: string, videoId: string) {
  after(() => {
    const run = (chains.get(workspaceId) ?? Promise.resolve())
      .then(() => analyzeAndDrain(userId, workspaceId, videoId, 150_000))
      .catch((e) => { console.error("[videos] analyzeSoon:", e instanceof Error ? e.message : e); });
    chains.set(workspaceId, run);
    return run.finally(() => { if (chains.get(workspaceId) === run) chains.delete(workspaceId); });
  });
}

/** Errores antiguos (texto técnico de Gemini) que no eran culpa del vídeo. Los mensajes nuevos van en español y no encajan. */
const RECOVERABLE = ["RESOURCE_EXHAUSTED", "429", "quota", "UNAVAILABLE", "overloaded", "análisis válido"];

/** Cola (cron): hasta `limit` vídeos pendientes por pasada, de uno en uno y sin pasarse del tiempo de la función. */
export async function processVideoQueue(admin: AdminClient, limit = 3, budgetMs = 35_000) {
  const started = Date.now();
  const now = new Date().toISOString();
  // Un análisis que lleva más de 10 minutos «en curso» se quedó colgado (la función se cortó): vuelve a la cola.
  await admin.from("saved_videos").update({ analysis_status: "pending" }).eq("analysis_status", "analyzing").lt("updated_at", new Date(Date.now() - 10 * 60_000).toISOString());
  // Los que fallaron por el límite de Gemini o por respuesta cortada (antes de este arreglo) vuelven solos a la cola.
  await admin.from("saved_videos").update({ analysis_status: "pending", analysis_attempts: 0, analysis_error: null, analysis_next_try_at: null })
    .eq("analysis_status", "error").or(RECOVERABLE.map((t) => `analysis_error.ilike.%${t}%`).join(","));
  const { data: rows } = await admin.from("saved_videos").select("id, user_id, workspace_id")
    .eq("analysis_status", "pending").or(`analysis_next_try_at.is.null,analysis_next_try_at.lte.${now}`).order("created_at").limit(limit);
  const out: Record<AnalyzeOutcome, number> = { ready: 0, needs_confirm: 0, retry: 0, blocked: 0, rate_limited: 0, queued: 0, error: 0, skipped: 0 };
  const stopped = new Set<string>(); // espacios al límite o con otro análisis en curso: se dejan para la próxima pasada
  let processed = 0;
  for (const r of rows ?? []) {
    if (Date.now() - started > budgetMs) break;
    if (stopped.has(r.workspace_id)) continue;
    const ctx = await adminVideoContext(admin, r.user_id, r.workspace_id);
    if (!ctx) continue;
    const res = await analyzeVideo(ctx, r.id);
    out[res]++;
    processed++;
    if (!KEEP_GOING.includes(res)) stopped.add(r.workspace_id);
  }
  return { processed, ...out };
}

// ------------------------------------------------------------------ sincronización con YouTube
export type SyncResult = { added: number; skipped: number; error?: string };

/** Importa «Me gusta» y las listas elegidas. Sin duplicados; para cuando una página ya es toda conocida. */
export async function syncYoutube(admin: AdminClient, integration: { user_id: string; workspace_id: string; sync_likes: boolean; sync_playlists: Json; last_sync_at: string | null }, o: { maxNew?: number } = {}): Promise<SyncResult> {
  const first = integration.last_sync_at === null;
  let budget = o.maxNew ?? (first ? 25 : 50);
  const a: Actor = { supabase: admin, workspaceId: integration.workspace_id, userId: integration.user_id, timezone: "Europe/Madrid" };
  const result: SyncResult = { added: 0, skipped: 0 };
  const mark = (patch: Record<string, unknown>) => admin.from("integrations").update(patch as never).eq("user_id", integration.user_id).eq("provider", "google");
  try {
    const token = await accessTokenFor(admin, integration.user_id);
    if (!token) { const error = "No se pudo renovar el acceso de Google; vuelve a conectar la cuenta."; await mark({ last_sync_error: error }); return { ...result, error }; }

    const importList = async (videos: YtVideo[], via: "youtube_like" | "youtube_playlist", origin: string) => {
      const known = new Set(((await admin.from("saved_videos").select("external_id").eq("workspace_id", a.workspaceId).eq("source", "youtube").in("external_id", videos.map((x) => x.id))).data ?? []).map((x) => x.external_id));
      let allKnown = true;
      for (const v of videos) {
        if (known.has(v.id)) { result.skipped++; continue; }
        allKnown = false;
        if (budget <= 0) continue;
        const r = await addVideoByUrl(a, `https://www.youtube.com/watch?v=${v.id}`, { via, originList: origin, meta: { title: v.title, channel: v.channel, thumbnail: v.thumbnail, durationSec: v.durationSec, publishedAt: v.publishedAt } });
        if (r.ok && !r.duplicate) { result.added++; budget--; }
      }
      return allKnown;
    };

    if (integration.sync_likes) {
      let page: string | undefined;
      for (let i = 0; i < 6 && budget > 0; i++) {
        const p = await likedPage(token, page);
        const allKnown = await importList(p.videos, "youtube_like", "Me gusta");
        if (allKnown || !p.next) break;
        page = p.next;
      }
    }
    const lists = Array.isArray(integration.sync_playlists) ? (integration.sync_playlists as { id: string; title: string }[]) : [];
    for (const l of lists) {
      let page: string | undefined;
      for (let i = 0; i < 3 && budget > 0; i++) {
        const p = await playlistPage(token, l.id, page);
        const allKnown = await importList(p.ids.length ? await videoDetails(token, p.ids) : [], "youtube_playlist", l.title);
        if (allKnown || !p.next) break;
        page = p.next;
      }
    }
    await mark({ last_sync_at: new Date().toISOString(), last_sync_error: null, last_sync_added: result.added });
  } catch (e) {
    const error = (e instanceof Error ? e.message : "Error al sincronizar").slice(0, 300);
    await mark({ last_sync_error: error });
    return { ...result, error };
  }
  return result;
}

// ------------------------------------------------------------------ listas por RSS (sin Google Cloud)
export type FeedRow = { id: string; workspace_id: string; user_id: string; playlist_id: string; title: string };
export type FeedSyncResult = SyncResult & { newIds: string[] };

/** Lee una lista pública por RSS y guarda en Favoritos los vídeos que aún no están. No lanza: deja el error en la fila. */
export async function syncPlaylistFeed(admin: AdminClient, feed: FeedRow, f: typeof fetch = fetch): Promise<FeedSyncResult> {
  const a: Actor = { supabase: admin, workspaceId: feed.workspace_id, userId: feed.user_id, timezone: "Europe/Madrid" };
  const result: FeedSyncResult = { added: 0, skipped: 0, newIds: [] };
  const now = new Date().toISOString();
  try {
    const { title, entries } = await fetchPlaylistFeed(feed.playlist_id, f);
    const ids = entries.map((e) => e.id);
    const known = new Set(ids.length ? ((await admin.from("saved_videos").select("external_id").eq("workspace_id", a.workspaceId).eq("source", "youtube").in("external_id", ids)).data ?? []).map((x) => x.external_id) : []);
    for (const e of entries) {
      if (known.has(e.id)) { result.skipped++; continue; }
      const r = await addVideoByUrl(a, `https://www.youtube.com/watch?v=${e.id}`, { via: "youtube_playlist", originList: title ?? feed.title, meta: { title: e.title, channel: e.channel, thumbnail: e.thumbnail, publishedAt: e.publishedAt } });
      if (r.ok && !r.duplicate) { result.added++; result.newIds.push(r.id); }
    }
    await admin.from("youtube_feeds").update({ last_checked_at: now, last_error: null, last_added: result.added, ...(title ? { title } : {}) }).eq("id", feed.id);
  } catch (e) {
    const error = e instanceof FeedError ? e.message : "No se pudo leer la lista. Se reintentará más tarde.";
    if (!(e instanceof FeedError)) console.error("[videos] feed:", e instanceof Error ? e.message : e);
    await admin.from("youtube_feeds").update({ last_checked_at: now, last_error: error }).eq("id", feed.id);
    return { ...result, error };
  }
  return result;
}

/** Revisa las listas que llevan más de `staleMinutes` sin mirarse (desde el cron y al abrir Favoritos). */
export async function syncStaleFeeds(admin: AdminClient, o: { workspaceId?: string; staleMinutes?: number; limit?: number } = {}) {
  const cutoff = new Date(Date.now() - (o.staleMinutes ?? 60) * 60_000).toISOString();
  let q = admin.from("youtube_feeds").select("id, workspace_id, user_id, playlist_id, title")
    .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`).order("last_checked_at", { ascending: true, nullsFirst: true }).limit(o.limit ?? 5);
  if (o.workspaceId) q = q.eq("workspace_id", o.workspaceId);
  const { data } = await q;
  let added = 0, errors = 0;
  for (const feed of data ?? []) {
    const r = await syncPlaylistFeed(admin, feed);
    added += r.added;
    if (r.error) errors++;
  }
  return { feeds: data?.length ?? 0, added, errors };
}

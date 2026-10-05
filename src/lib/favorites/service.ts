import "server-only";
import { after } from "next/server";
import { addTagsTo, resolveBusiness, type Actor } from "@/lib/ai/actors";
import { AiBlockedError, priceFor, runAi, type AiContext } from "@/lib/ai/run";
import { estimateVideoCostMicros } from "@/lib/ai/pricing";
import { geminiProvider, getModelNames } from "@/lib/ai/gemini";
import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { buildVideoPrompt, parseVideoAnalysis, pickCategory, videoAnalysisJsonSchema } from "./analysis";
import { decryptSecret } from "./crypto";
import { resolveTiktokShort, tiktokOembed, youtubeOembed } from "./oembed";
import { classifyVideoUrl, firstUrl } from "./url";
import { GoogleError, likedPage, playlistPage, refreshAccessToken, videoDetails, type YtVideo } from "./youtube";

export type VideoMeta = { title?: string | null; channel?: string | null; thumbnail?: string | null; durationSec?: number | null; publishedAt?: string | null };
export type AddResult = { ok: true; id: string; duplicate: boolean; source: string } | { ok: false; error: string };

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
  if (!o.meta) {
    const oe = ref.source === "youtube" ? await youtubeOembed(ref.url) : ref.source === "tiktok" ? await tiktokOembed(ref.url) : null;
    if (oe) meta = { title: oe.title, channel: oe.author, thumbnail: oe.thumbnail };
  }
  const fallbackTitle = ref.source === "other" ? new URL(ref.url).hostname.replace(/^www\./, "") : ref.source === "tiktok" ? "Vídeo de TikTok" : "Vídeo de YouTube";
  const { data, error } = await a.supabase.from("saved_videos").insert({
    workspace_id: a.workspaceId, user_id: a.userId, source: ref.source, external_id: ref.externalId, url: ref.url,
    title: (meta.title ?? fallbackTitle).slice(0, 300), channel: meta.channel ?? null, thumbnail_url: meta.thumbnail ?? null,
    duration_sec: meta.durationSec ?? null, published_at: meta.publishedAt ?? null, added_via: o.via ?? "manual", origin_list: o.originList ?? null,
  }).select("id").single();
  if (error) {
    if (error.code === "23505") return { ok: true, id: "", duplicate: true, source: ref.source }; // carrera: ya existe
    return { ok: false, error: "No se pudo guardar el vídeo" };
  }
  return { ok: true, id: data.id, duplicate: false, source: ref.source };
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
export type AnalyzeOutcome = "ready" | "needs_confirm" | "retry" | "blocked" | "error" | "skipped";
const RETRY_MINUTES = [5, 15, 60];
const UNKNOWN_DURATION_ESTIMATE_SEC = 30 * 60;

type Ctx = AiContext & { videoLongMinutes: number };

/** Coste estimado (micro-€) de analizar un vídeo con el modelo de vídeo; para pedir confirmación. */
export async function estimateVideoCost(ctx: Pick<AiContext, "supabase" | "workspaceId" | "models">, durationSec: number | null): Promise<number> {
  return estimateVideoCostMicros(durationSec ?? UNKNOWN_DURATION_ESTIMATE_SEC, await priceFor(ctx, ctx.models.video));
}

/**
 * Analiza un vídeo guardado. YouTube se envía a Gemini por su URL; el resto (y el análisis «ligero») usan solo el texto
 * disponible (título, autor, descripción), y la ficha lo indica. Un vídeo largo no se analiza sin confirmación.
 */
export async function analyzeVideo(ctx: Ctx, videoId: string, o: { mode?: "video" | "light"; confirmed?: boolean } = {}): Promise<AnalyzeOutcome> {
  const { supabase, workspaceId } = ctx;
  const { data: v } = await supabase.from("saved_videos").select("*").eq("id", videoId).eq("workspace_id", workspaceId).maybeSingle();
  if (!v || (v.analysis_status === "ready" && !o.mode) || v.analysis_status === "analyzing") return "skipped";
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

  const textOnly = v.source !== "youtube";
  const light = o.mode === "light";
  const isLong = !textOnly && !light && (duration == null ? false : duration > ctx.videoLongMinutes * 60);
  if (isLong && !o.confirmed) { await save({ analysis_status: "needs_confirm", analysis_error: null }); return "needs_confirm"; }

  try {
    await save({ analysis_status: "analyzing", analysis_attempts: v.analysis_attempts + 1 });
    const a: Actor = { supabase, workspaceId, userId: v.user_id, timezone: ctx.timezone };
    const [biz, cats] = await Promise.all([
      supabase.from("businesses").select("name, description").eq("workspace_id", workspaceId).eq("archived", false).limit(30),
      supabase.from("video_categories").select("id, name").eq("workspace_id", workspaceId),
    ]);
    const useText = textOnly || light;
    const info = `Título: ${v.title}\nAutor: ${v.channel ?? "desconocido"}\nEnlace: ${v.url}${description ? `\nDescripción: ${description}` : ""}`;
    const parts = useText ? [{ text: info }] : [{ fileData: { fileUri: v.url } }, { text: `Analiza este vídeo.\n${info}` }];
    const estimated = useText ? 0 : await estimateVideoCost(ctx, duration);
    const res = await runAi(ctx, light ? "video_light" : useText ? "video_light" : "video", {
      model: useText ? ctx.models.fast : ctx.models.video,
      system: buildVideoPrompt({ businesses: biz.data ?? [], categories: (cats.data ?? []).map((c) => c.name), textOnly: useText, light }),
      contents: [{ role: "user", parts }], jsonSchema: videoAnalysisJsonSchema(), temperature: 0.2, maxOutputTokens: 1500,
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
      analysis_cost_micros: v.analysis_cost_micros + res.costMicros, summary: an.summary, key_points: an.key_points as unknown as Json, actions: an.actions as unknown as Json,
      utility: an.utility, category_id: categoryId, business_id: b?.id ?? null, business_reason: b ? an.business_reason : null,
    });
    if (an.tags.length) await addTagsTo(a, "video", videoId, an.tags);
    return "ready";
  } catch (e) {
    if (e instanceof AiBlockedError) {
      const wait = e.reason === "busy" ? 2 : e.reason === "blocked" ? 6 * 60 : 60;
      await save({ analysis_status: "pending", analysis_error: e.message.slice(0, 300), analysis_next_try_at: new Date(Date.now() + wait * 60_000).toISOString(), analysis_attempts: v.analysis_attempts });
      return "blocked";
    }
    const attempts = v.analysis_attempts + 1;
    const msg = (e instanceof Error ? e.message : "Error de IA").slice(0, 300);
    if (attempts >= 4) { await save({ analysis_status: "error", analysis_error: msg, analysis_next_try_at: null }); return "error"; }
    await save({ analysis_status: "pending", analysis_error: msg, analysis_next_try_at: new Date(Date.now() + RETRY_MINUTES[attempts - 1] * 60_000).toISOString() });
    return "retry";
  }
}

/** Contexto de IA de un usuario concreto, con la clave de servicio (cola en segundo plano). */
export async function adminVideoContext(admin: AdminClient, userId: string, workspaceId: string): Promise<Ctx | null> {
  const { data: p } = await admin.from("profiles").select("timezone, ai_monthly_budget_cents, video_long_minutes").eq("user_id", userId).maybeSingle();
  if (!p) return null;
  return { supabase: admin, workspaceId, userId, timezone: p.timezone, budgetCents: p.ai_monthly_budget_cents, provider: geminiProvider(), models: getModelNames(), videoLongMinutes: p.video_long_minutes };
}

/** Lanza el análisis de un vídeo recién guardado una vez enviada la respuesta (no hace esperar a la persona). */
export function analyzeSoon(userId: string, workspaceId: string, videoId: string) {
  after(async () => {
    try {
      const admin = createAdminClient();
      const ctx = await adminVideoContext(admin, userId, workspaceId);
      if (ctx) await analyzeVideo(ctx, videoId);
    } catch (e) { console.error("[videos] analyzeSoon:", e instanceof Error ? e.message : e); }
  });
}

/** Cola (cron): hasta `limit` vídeos pendientes por pasada, respetando reintentos. */
export async function processVideoQueue(admin: AdminClient, limit = 3) {
  const now = new Date().toISOString();
  // Un análisis que lleva más de 10 minutos «en curso» se quedó colgado (la función se cortó): vuelve a la cola.
  await admin.from("saved_videos").update({ analysis_status: "pending" }).eq("analysis_status", "analyzing").lt("updated_at", new Date(Date.now() - 10 * 60_000).toISOString());
  const { data: rows } = await admin.from("saved_videos").select("id, user_id, workspace_id")
    .eq("analysis_status", "pending").or(`analysis_next_try_at.is.null,analysis_next_try_at.lte.${now}`).order("created_at").limit(limit);
  const out: Record<AnalyzeOutcome, number> = { ready: 0, needs_confirm: 0, retry: 0, blocked: 0, error: 0, skipped: 0 };
  for (const r of rows ?? []) {
    const ctx = await adminVideoContext(admin, r.user_id, r.workspace_id);
    if (!ctx) continue;
    out[await analyzeVideo(ctx, r.id)]++;
  }
  return { processed: rows?.length ?? 0, ...out };
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

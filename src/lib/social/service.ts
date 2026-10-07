import "server-only";
import { addDays, nowLocal, zonedToUtc } from "@/lib/dates";
import { decryptSecret, encryptSecret } from "@/lib/favorites/crypto";
import type { AdminClient } from "@/lib/supabase/admin";
import { IgError, igContainerStatus, igCreateContainer, igDayInsights, igMediaInsights, igProfile, igPublish, igRecentMedia, igRefresh } from "./instagram";
import { composeCaption, nextRetry, tokenState } from "./stats";

export type SocialAccount = {
  id: string; workspace_id: string; user_id: string; platform: string; external_id: string; access_token_enc: string; refresh_token_enc: string | null;
  token_expires_at: string | null; refresh_expires_at: string | null; status: string; last_snapshot_on: string | null; created_at: string; updated_at: string;
};
const ACC_FIELDS = "id, workspace_id, user_id, platform, external_id, access_token_enc, refresh_token_enc, token_expires_at, refresh_expires_at, status, last_snapshot_on, created_at, updated_at";
export const SOCIAL_BUCKET = "social-media";
/** Los archivos se borran estos días después de publicar (no hacen falta y así no se llena el plan gratuito). */
export const KEEP_FILES_DAYS = 3;
/** Espacio que se permite usar en total (el plan gratuito de Supabase da 1 GB para todo Storage). */
export const STORAGE_LIMIT_BYTES = 500 * 1024 * 1024;

type Hooks = { tiktokToken?: (admin: AdminClient, acc: SocialAccount) => Promise<string | null>; tiktokTarget?: (admin: AdminClient, t: TargetRow, acc: SocialAccount, post: PostRow, files: FileRow[]) => Promise<void>; tiktokSnapshot?: (admin: AdminClient, acc: SocialAccount, day: string) => Promise<void> };
const hooks: Hooks = {};
/** TikTok se registra aquí (src/lib/social/tiktok-service.ts) para no mezclar los dos clientes. */
export function registerSocialHooks(h: Hooks) { Object.assign(hooks, h); }

/** Token de una cuenta, renovándolo si caduca en menos de 10 días (Instagram: 60 días renovables). */
export async function socialToken(admin: AdminClient, acc: SocialAccount, now = new Date()): Promise<string | null> {
  if (acc.platform === "tiktok") return hooks.tiktokToken ? hooks.tiktokToken(admin, acc) : null;
  const token = decryptSecret(acc.access_token_enc);
  const expires = acc.token_expires_at ? new Date(acc.token_expires_at).getTime() : Infinity;
  const ageOk = now.getTime() - new Date(acc.updated_at).getTime() > 24 * 3600_000 || now.getTime() - new Date(acc.created_at).getTime() > 24 * 3600_000;
  if (expires - now.getTime() < 10 * 86400_000 && expires > now.getTime() && ageOk) {
    try {
      const r = await igRefresh(token);
      const exp = new Date(now.getTime() + r.expiresIn * 1000).toISOString();
      await admin.from("social_accounts").update({ access_token_enc: encryptSecret(r.accessToken), token_expires_at: exp, status: "ok", last_error: null }).eq("id", acc.id);
      return r.accessToken;
    } catch (e) {
      await admin.from("social_accounts").update({ status: tokenState(acc.token_expires_at, now) === "expired" ? "expired" : "expiring", last_error: (e instanceof Error ? e.message : "No se pudo renovar").slice(0, 300) }).eq("id", acc.id);
    }
  }
  if (expires <= now.getTime()) { await admin.from("social_accounts").update({ status: "expired" }).eq("id", acc.id); return null; }
  return token;
}

const markError = (admin: AdminClient, acc: SocialAccount, e: unknown) =>
  admin.from("social_accounts").update({ status: e instanceof IgError && e.expired ? "expired" : "error", last_error: (e instanceof Error ? e.message : "Error").slice(0, 300) }).eq("id", acc.id);

/** Foto diaria (de ayer, en hora de Madrid) + publicaciones recientes con sus métricas. */
export async function snapshotAccount(admin: AdminClient, acc: SocialAccount, now = new Date(), tz = "Europe/Madrid") {
  const yesterday = addDays(nowLocal(now, tz).date, -1);
  if (acc.platform === "tiktok") { if (hooks.tiktokSnapshot) await hooks.tiktokSnapshot(admin, acc, yesterday); return; }
  const token = await socialToken(admin, acc, now);
  if (!token) return;
  try {
    const profile = await igProfile(token);
    const ins = await igDayInsights(token, acc.external_id, Math.floor(zonedToUtc(yesterday, "00:00", tz).getTime() / 1000)).catch(() => ({} as Record<string, number>));
    await admin.from("social_daily").upsert({
      workspace_id: acc.workspace_id, account_id: acc.id, day: yesterday, followers: profile.followers, reach: ins.reach ?? null, views: ins.views ?? null,
      interactions: ins.total_interactions ?? null, likes: ins.likes ?? null, comments: ins.comments ?? null, shares: ins.shares ?? null, saves: ins.saves ?? null, profile_views: ins.profile_views ?? null,
    }, { onConflict: "account_id,day" });
    await upsertIgMedia(admin, acc, token, now);
    await admin.from("social_accounts").update({ last_snapshot_on: yesterday, last_media_sync_at: now.toISOString(), username: profile.username, display_name: profile.name, avatar_url: profile.avatar?.startsWith("https://") ? profile.avatar.slice(0, 2000) : null, status: tokenState(acc.token_expires_at, now) === "ok" ? "ok" : "expiring", last_error: null }).eq("id", acc.id);
  } catch (e) { await markError(admin, acc, e); }
}

/** Publicaciones recientes de Instagram con sus métricas (las de los últimos 45 días con estadísticas detalladas). */
export async function upsertIgMedia(admin: AdminClient, acc: SocialAccount, token: string, now = new Date()) {
  const media = await igRecentMedia(token, 30, fetch, acc.external_id);
  const recent = media.filter((m) => now.getTime() - new Date(m.postedAt).getTime() < 45 * 86400_000);
  const rows = [];
  for (const m of media) {
    const mi = recent.includes(m) ? await igMediaInsights(token, m.id) : {};
    rows.push({ workspace_id: acc.workspace_id, account_id: acc.id, external_id: m.id, caption: m.caption, media_type: m.mediaType, permalink: m.permalink?.startsWith("https://") ? m.permalink : null,
      thumbnail_url: m.thumbnail?.startsWith("https://") ? m.thumbnail.slice(0, 4000) : null, posted_at: m.postedAt, likes: m.likes, comments: m.comments,
      reach: mi.reach ?? null, views: mi.views ?? null, saves: mi.saved ?? null, shares: mi.shares ?? null, interactions: mi.total_interactions ?? (m.likes ?? 0) + (m.comments ?? 0) });
  }
  if (rows.length) await admin.from("social_media").upsert(rows, { onConflict: "account_id,external_id" });
  return rows.length;
}

export type PostRow = { id: string; workspace_id: string; user_id: string; caption: string; hashtags: string; media_kind: string; scheduled_at: string | null; status: string; title: string | null };
export type TargetRow = { id: string; post_id: string; account_id: string; mode: string; status: string; attempts: number; container_id: string | null; next_try_at: string | null };
export type FileRow = { path: string; mime: string; position: number };

async function signedUrls(admin: AdminClient, files: FileRow[]) {
  const out: { url: string; video: boolean }[] = [];
  for (const f of [...files].sort((a, b) => a.position - b.position)) {
    const { data } = await admin.storage.from(SOCIAL_BUCKET).createSignedUrl(f.path, 3 * 3600);
    if (!data?.signedUrl) throw new IgError("No se encontró un archivo de la publicación", undefined, false, false);
    out.push({ url: data.signedUrl, video: f.mime.startsWith("video/") });
  }
  return out;
}

/** Un paso de publicación en Instagram: crear contenedor → esperar a que esté listo → publicar. */
async function stepInstagram(admin: AdminClient, t: TargetRow, acc: SocialAccount, post: PostRow, files: FileRow[], now: Date) {
  const save = (patch: Record<string, unknown>) => admin.from("social_post_targets").update(patch as never).eq("id", t.id);
  const token = await socialToken(admin, acc, now);
  if (!token) { await save({ status: "error", error: "La conexión con Instagram caducó: vuelve a conectarla en Redes." }); return; }
  try {
    if (!t.container_id) {
      if (!files.length) throw new IgError("La publicación no tiene ninguna foto o vídeo", undefined, false, false);
      const kind = post.media_kind === "carousel" && files.length > 1 ? "carousel" : post.media_kind === "reel" || post.media_kind === "video" ? "reel" : "image";
      const id = await igCreateContainer(token, acc.external_id, { kind, urls: await signedUrls(admin, files), caption: composeCaption(post.caption, post.hashtags) });
      await save({ container_id: id, status: "publicando", next_try_at: new Date(now.getTime() + (kind === "image" ? 30_000 : 60_000)).toISOString(), error: null });
      return;
    }
    const st = await igContainerStatus(token, t.container_id);
    if (st === "IN_PROGRESS") { await save({ next_try_at: new Date(now.getTime() + 60_000).toISOString() }); return; }
    if (st !== "FINISHED" && st !== "PUBLISHED") throw new IgError(`Instagram no aceptó el archivo (${st}). Revisa el formato: foto JPG, o vídeo MP4 de 3 s a 15 min.`, undefined, false, st === "EXPIRED");
    const r = await igPublish(token, acc.external_id, t.container_id);
    await save({ status: "publicada", external_id: r.id, permalink: r.permalink?.startsWith("https://") ? r.permalink : null, published_at: now.toISOString(), error: null, next_try_at: null });
  } catch (e) {
    const retry = e instanceof IgError ? e.retryable : true;
    const when = retry ? nextRetry(t.attempts, now) : null;
    await save({ attempts: t.attempts + 1, container_id: e instanceof IgError && !e.retryable ? null : t.container_id, status: when ? "pendiente" : "error", next_try_at: when?.toISOString() ?? null, error: (e instanceof Error ? e.message : "Error al publicar").slice(0, 500) });
    if (e instanceof IgError && e.expired) await markError(admin, acc, e);
  }
}

/** Estado general de la publicación a partir de sus redes. */
export function overallStatus(targets: { status: string }[]): "programada" | "publicando" | "publicada" | "error" {
  if (!targets.length) return "programada";
  const done = (s: string) => s === "publicada" || s === "enviada" || s === "avisada";
  if (targets.every((t) => done(t.status))) return "publicada";
  if (targets.some((t) => t.status === "error") && !targets.some((t) => t.status === "pendiente" || t.status === "publicando")) return "error";
  return targets.some((t) => t.status !== "pendiente") ? "publicando" : "programada";
}

/** Cron: publica lo que toque (con reintentos), hace la foto diaria, renueva tokens y borra archivos viejos. */
export async function runSocialCron(admin: AdminClient, now = new Date()) {
  const out: Record<string, number> = { published: 0, steps: 0, snapshots: 0, cleaned: 0 };
  // 1) Publicaciones vencidas.
  const { data: due } = await admin.from("social_posts").select("id, workspace_id, user_id, caption, hashtags, media_kind, scheduled_at, status, title")
    .in("status", ["programada", "publicando"]).lte("scheduled_at", now.toISOString()).order("scheduled_at").limit(10);
  for (const post of due ?? []) {
    const [{ data: targets }, { data: files }] = await Promise.all([
      admin.from("social_post_targets").select("id, post_id, account_id, mode, status, attempts, container_id, next_try_at").eq("post_id", post.id),
      admin.from("social_post_files").select("path, mime, position").eq("post_id", post.id).is("deleted_at", null),
    ]);
    for (const t of targets ?? []) {
      if (!(t.status === "pendiente" || t.status === "publicando") || (t.next_try_at && t.next_try_at > now.toISOString())) continue;
      const { data: acc } = await admin.from("social_accounts").select(ACC_FIELDS).eq("id", t.account_id).maybeSingle();
      if (!acc) continue;
      out.steps++;
      try {
        if (acc.platform === "instagram") await stepInstagram(admin, t, acc, post, files ?? [], now);
        else if (hooks.tiktokTarget) await hooks.tiktokTarget(admin, t, acc, post, files ?? []);
      } catch (e) { // un fallo inesperado (p. ej. token ilegible) no para las demás
        await admin.from("social_post_targets").update({ status: "error", error: (e instanceof Error ? e.message : "Error").slice(0, 500) }).eq("id", t.id);
      }
    }
    const { data: after } = await admin.from("social_post_targets").select("status").eq("post_id", post.id);
    const st = overallStatus(after ?? []);
    if (st === "publicada") out.published++;
    if (st !== post.status) await admin.from("social_posts").update({ status: st }).eq("id", post.id);
  }
  // 2) Foto diaria (una cuenta por pasada para no pasar del tiempo máximo).
  const yesterday = addDays(nowLocal(now, "Europe/Madrid").date, -1);
  const { data: snap } = await admin.from("social_accounts").select(ACC_FIELDS).neq("status", "expired").or(`last_snapshot_on.is.null,last_snapshot_on.lt.${yesterday}`).limit(2);
  for (const acc of snap ?? []) {
    try { await snapshotAccount(admin, acc, now); out.snapshots++; }
    catch (e) { await markError(admin, acc, e); await admin.from("social_accounts").update({ last_snapshot_on: yesterday }).eq("id", acc.id); }
  }
  // 2b) Actualización de cada cuenta (seguidores, publicaciones y bandeja) cada hora; unas pocas por pasada.
  try {
    const { syncDue } = await import("@/lib/sync/service");
    const r = await syncDue(admin, { limit: 3, staleMinutes: 60, now });
    Object.assign(out, { synced: r.accounts, limited: r.limited, messages: r.messages });
  } catch (e) { console.error("[cron] sync:", e instanceof Error ? e.message : e); }
  // 3) Renovar tokens que caducan pronto aunque no toque foto.
  const soon = new Date(now.getTime() + 10 * 86400_000).toISOString();
  const { data: expiring } = await admin.from("social_accounts").select(ACC_FIELDS).neq("status", "expired").lt("token_expires_at", soon).limit(3);
  for (const acc of expiring ?? []) await socialToken(admin, acc, now).catch((e) => markError(admin, acc, e));
  // 4) Borrar archivos de publicaciones ya publicadas hace más de KEEP_FILES_DAYS días.
  const cutoff = new Date(now.getTime() - KEEP_FILES_DAYS * 86400_000).toISOString();
  const { data: old } = await admin.from("social_post_files").select("id, path, social_posts!inner(status, scheduled_at)").is("deleted_at", null)
    .eq("social_posts.status", "publicada").lt("social_posts.scheduled_at", cutoff).limit(50);
  if (old?.length) {
    await admin.storage.from(SOCIAL_BUCKET).remove(old.map((f) => f.path));
    await admin.from("social_post_files").update({ deleted_at: now.toISOString() }).in("id", old.map((f) => f.id));
    out.cleaned = old.length;
  }
  return out;
}

import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/favorites/crypto";
import { webPushSender } from "@/lib/notifications/push";
import type { AdminClient } from "@/lib/supabase/admin";
import { composeCaption, nextRetry } from "./stats";
import { registerSocialHooks, SOCIAL_BUCKET, type FileRow, type PostRow, type SocialAccount, type TargetRow } from "./service";
import { TtError, ttCreatorInfo, ttInitUpload, ttPrivacy, ttProfile, ttPublishStatus, ttRefresh, ttUpload, ttVideos } from "./tiktok";

const audited = () => process.env.TIKTOK_DIRECT_POST_AUDITED === "1";

/** Token de TikTok: el de acceso dura 24 h; se renueva con el refresh (365 días), que TikTok puede rotar. */
export async function tiktokToken(admin: AdminClient, acc: SocialAccount, now = new Date()): Promise<string | null> {
  const exp = acc.token_expires_at ? new Date(acc.token_expires_at).getTime() : 0;
  if (exp - now.getTime() > 10 * 60_000) return decryptSecret(acc.access_token_enc);
  if (!acc.refresh_token_enc || (acc.refresh_expires_at && new Date(acc.refresh_expires_at).getTime() <= now.getTime())) {
    await admin.from("social_accounts").update({ status: "expired", last_error: "La conexión con TikTok caducó: vuelve a conectarla." }).eq("id", acc.id);
    return null;
  }
  try {
    const t = await ttRefresh(decryptSecret(acc.refresh_token_enc));
    await admin.from("social_accounts").update({
      access_token_enc: encryptSecret(t.accessToken), refresh_token_enc: encryptSecret(t.refreshToken), token_expires_at: new Date(now.getTime() + t.expiresIn * 1000).toISOString(),
      refresh_expires_at: new Date(now.getTime() + t.refreshExpiresIn * 1000).toISOString(), scopes: t.scope.slice(0, 1000) || undefined, status: "ok", last_error: null,
    }).eq("id", acc.id);
    return t.accessToken;
  } catch (e) {
    await admin.from("social_accounts").update({ status: e instanceof TtError && e.expired ? "expired" : "error", last_error: (e instanceof Error ? e.message : "Error").slice(0, 300) }).eq("id", acc.id);
    return null;
  }
}

/** Foto diaria: seguidores + acumulados de sus vídeos; el dato del día es la diferencia con la foto anterior. */
export async function tiktokSnapshot(admin: AdminClient, acc: SocialAccount, day: string, now = new Date()) {
  const token = await tiktokToken(admin, acc, now);
  if (!token) return;
  try {
    const [p, videos] = await Promise.all([ttProfile(token), ttVideos(token, 3)]);
    const viewsTotal = videos.reduce((s, v) => s + v.views, 0), interTotal = videos.reduce((s, v) => s + v.likes + v.comments + v.shares, 0);
    const { data: prev } = await admin.from("social_daily").select("views_total, interactions_total").eq("account_id", acc.id).lt("day", day).order("day", { ascending: false }).limit(1).maybeSingle();
    const diff = (a: number, b: number | null | undefined) => (b == null ? null : Math.max(0, a - Number(b)));
    await admin.from("social_daily").upsert({
      workspace_id: acc.workspace_id, account_id: acc.id, day, followers: p.followers, views: diff(viewsTotal, prev?.views_total), interactions: diff(interTotal, prev?.interactions_total),
      likes: p.likes, views_total: viewsTotal, interactions_total: interTotal,
    }, { onConflict: "account_id,day" });
    if (videos.length) await admin.from("social_media").upsert(videos.map((v) => ({
      workspace_id: acc.workspace_id, account_id: acc.id, external_id: v.id, caption: v.caption, media_type: "VIDEO", permalink: v.url?.startsWith("https://") ? v.url.slice(0, 2000) : null,
      thumbnail_url: v.cover?.startsWith("https://") ? v.cover.slice(0, 4000) : null, posted_at: v.createdAt, views: v.views, likes: v.likes, comments: v.comments, shares: v.shares, interactions: v.likes + v.comments + v.shares,
    })), { onConflict: "account_id,external_id" });
    await admin.from("social_accounts").update({ last_snapshot_on: day, last_media_sync_at: now.toISOString(), username: p.username, display_name: p.name, avatar_url: p.avatar?.startsWith("https://") ? p.avatar.slice(0, 2000) : null, status: "ok", last_error: null }).eq("id", acc.id);
  } catch (e) {
    await admin.from("social_accounts").update({ status: e instanceof TtError && e.expired ? "expired" : "error", last_error: (e instanceof Error ? e.message : "Error").slice(0, 300) }).eq("id", acc.id);
  }
}

/** Publicación asistida: aviso al móvil a la hora programada con el vídeo y el texto listos (/redes/publicar/<id>). */
async function sendAssistedPush(admin: AdminClient, userId: string, t: TargetRow, post: PostRow): Promise<boolean> {
  const { data: claimed } = await admin.from("notification_log").upsert({ user_id: userId, dedupe_key: `social:${t.id}`, kind: "social" }, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id");
  if (!claimed?.length) return true; // ya avisado
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  if (!subs?.length) return true; // sin móvil suscrito: se queda visible en Redes como «Aviso enviado» igualmente
  let send;
  try { send = webPushSender(); } catch { return true; }
  const payload = { title: "Hora de publicar en TikTok", body: post.title || post.caption.slice(0, 80) || "Tu vídeo está listo", url: `/redes/publicar/${post.id}`, kind: "social", tag: `social:${t.id}` };
  const results = await Promise.all(subs.map((s) => send(s, payload)));
  const gone = subs.filter((_, i) => !results[i].ok && (results[i] as { gone: boolean }).gone).map((s) => s.id);
  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
  return results.some((r) => r.ok) || results.every((r) => !r.ok && (r as { gone: boolean }).gone);
}

/** Un paso de publicación en TikTok según el modo: borrador en su bandeja, directa (auditada) o asistida. */
export async function tiktokTarget(admin: AdminClient, t: TargetRow, acc: SocialAccount, post: PostRow, files: FileRow[], now = new Date()) {
  const save = (patch: Record<string, unknown>) => admin.from("social_post_targets").update(patch as never).eq("id", t.id);
  if (t.mode === "assisted") {
    const ok = await sendAssistedPush(admin, post.user_id, t, post);
    await save(ok ? { status: "avisada", published_at: now.toISOString(), error: null } : { attempts: t.attempts + 1, next_try_at: nextRetry(t.attempts, now)?.toISOString() ?? null, status: nextRetry(t.attempts, now) ? "pendiente" : "error", error: "No se pudo enviar el aviso al móvil" });
    return;
  }
  const token = await tiktokToken(admin, acc, now);
  if (!token) { await save({ status: "error", error: "La conexión con TikTok caducó: vuelve a conectarla en Redes." }); return; }
  try {
    if (!t.container_id) {
      const video = files.find((f) => f.mime.startsWith("video/"));
      if (!video) throw new TtError("TikTok necesita un vídeo (MP4 o MOV)", undefined, false, false);
      const file = await admin.storage.from(SOCIAL_BUCKET).download(video.path);
      if (file.error || !file.data) throw new TtError("No se encontró el vídeo de la publicación", undefined, false, false);
      const bytes = Buffer.from(await file.data.arrayBuffer());
      const mode = t.mode === "direct" && audited() ? "direct" : "draft";
      const privacy = mode === "direct" ? ttPrivacy((await ttCreatorInfo(token)).privacyOptions, audited()) : undefined;
      const init = await ttInitUpload(token, { mode, size: bytes.length, title: composeCaption(post.caption, post.hashtags), privacy });
      await ttUpload(init.uploadUrl, bytes, video.mime);
      await save({ container_id: init.publishId, status: "publicando", privacy: privacy ?? null, next_try_at: new Date(now.getTime() + 60_000).toISOString(), error: null });
      return;
    }
    const st = await ttPublishStatus(token, t.container_id);
    if (st.status === "SEND_TO_USER_INBOX") await save({ status: "enviada", published_at: now.toISOString(), error: null, next_try_at: null });
    else if (st.status === "PUBLISH_COMPLETE") await save({ status: t.mode === "draft" ? "enviada" : "publicada", external_id: st.postId, published_at: now.toISOString(), error: null, next_try_at: null });
    else if (st.status === "FAILED") throw new TtError(`TikTok no pudo procesar el vídeo${st.reason ? ` (${st.reason})` : ""}`, undefined, false, false);
    else await save({ next_try_at: new Date(now.getTime() + 60_000).toISOString() });
  } catch (e) {
    const retry = e instanceof TtError ? e.retryable : true;
    const when = retry ? nextRetry(t.attempts, now) : null;
    await save({ attempts: t.attempts + 1, container_id: retry ? t.container_id : null, status: when ? "pendiente" : "error", next_try_at: when?.toISOString() ?? null, error: (e instanceof Error ? e.message : "Error al publicar").slice(0, 500) });
  }
}

registerSocialHooks({ tiktokToken, tiktokTarget, tiktokSnapshot });

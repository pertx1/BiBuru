import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/favorites/crypto";
import { GoogleError, refreshAccessToken } from "@/lib/favorites/youtube";
import type { AdminClient } from "@/lib/supabase/admin";
import { filesFor } from "./platforms";
import { composeCaption, nextRetry } from "./stats";
import { registerSocialHooks, SOCIAL_BUCKET, type FileRow, type PostRow, type SocialAccount, type TargetRow } from "./service";
import { YtError, ytTags, ytTitle, ytUpload } from "./youtube";

/** El token de acceso de Google dura 1 h: se guarda cifrado y se renueva con el de renovación (que no caduca salvo que se revoque). */
const ACCESS_SECONDS = 3300;
/** Marca en `container_id` mientras se sube el vídeo. */
const UPLOAD_STARTED = "subiendo";

export async function youtubeToken(admin: AdminClient, acc: SocialAccount, now = new Date()): Promise<string | null> {
  const exp = acc.token_expires_at ? new Date(acc.token_expires_at).getTime() : 0;
  if (exp - now.getTime() > 5 * 60_000) return decryptSecret(acc.access_token_enc);
  if (!acc.refresh_token_enc) {
    await admin.from("social_accounts").update({ status: "expired", last_error: "La conexión con YouTube caducó: vuelve a conectarla." }).eq("id", acc.id);
    return null;
  }
  try {
    const token = await refreshAccessToken(decryptSecret(acc.refresh_token_enc));
    await admin.from("social_accounts").update({ access_token_enc: encryptSecret(token), token_expires_at: new Date(now.getTime() + ACCESS_SECONDS * 1000).toISOString(), status: "ok", last_error: null }).eq("id", acc.id);
    return token;
  } catch (e) {
    const revoked = e instanceof GoogleError && e.revoked;
    await admin.from("social_accounts").update({ status: revoked ? "expired" : "error", last_error: (revoked ? "Quitaste el acceso a YouTube: vuelve a conectarlo." : e instanceof Error ? e.message : "Error").slice(0, 300) }).eq("id", acc.id);
    return null;
  }
}

/** Un paso de publicación en YouTube: sube el vídeo como Short (de una vez; YouTube lo procesa después por su cuenta). */
export async function youtubeTarget(admin: AdminClient, t: TargetRow, acc: SocialAccount, post: PostRow, files: FileRow[], now = new Date()) {
  const save = (patch: Record<string, unknown>) => admin.from("social_post_targets").update(patch as never).eq("id", t.id);
  const token = await youtubeToken(admin, acc, now);
  if (!token) { await save({ status: "error", error: "La conexión con YouTube caducó: vuelve a conectarla en Redes." }); return; }
  // Una subida a medias (el cron se cortó) no se repite sola, para no duplicar el vídeo: «Reintentar» la vuelve a lanzar.
  if (t.container_id === UPLOAD_STARTED) {
    await save({ status: "error", container_id: null, next_try_at: null, error: "La subida a YouTube se interrumpió. Mira en YouTube Studio si el vídeo está; si no, pulsa Reintentar." });
    return;
  }
  try {
    const [video] = filesFor("short", files);
    if (!video) throw new YtError("YouTube necesita un vídeo (MP4 o MOV)", undefined, false, false);
    const file = await admin.storage.from(SOCIAL_BUCKET).download(video.path);
    if (file.error || !file.data) throw new YtError("No se encontró el vídeo de la publicación", undefined, false, false);
    await save({ status: "publicando", container_id: UPLOAD_STARTED, next_try_at: new Date(now.getTime() + 10 * 60_000).toISOString(), error: null });
    const id = await ytUpload(token, { bytes: Buffer.from(await file.data.arrayBuffer()), mime: video.mime }, {
      title: ytTitle(post.title, post.caption), description: composeCaption(post.caption, post.hashtags, 5000),
      privacy: t.privacy ?? "public", madeForKids: t.made_for_kids, tags: ytTags(post.hashtags),
    });
    await save({ status: "publicada", container_id: id, external_id: id, permalink: `https://www.youtube.com/shorts/${id}`, published_at: now.toISOString(), error: null, next_try_at: null });
  } catch (e) {
    const retry = e instanceof YtError ? e.retryable : true;
    const when = retry ? nextRetry(t.attempts, now) : null;
    await save({ attempts: t.attempts + 1, status: when ? "pendiente" : "error", container_id: null, next_try_at: when?.toISOString() ?? null, error: (e instanceof Error ? e.message : "Error al publicar").slice(0, 500) });
    if (e instanceof YtError && e.expired) await admin.from("social_accounts").update({ status: "expired", last_error: e.message.slice(0, 300) }).eq("id", acc.id);
  }
}

registerSocialHooks({ youtubeToken, youtubeTarget });

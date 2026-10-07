/**
 * TikTok for Developers (API v2): Login Kit, Display API (perfil y vídeos) y Content Posting API.
 * Hasta que TikTok audite la app, lo publicado por API queda en privado (SELF_ONLY). Por eso, sin auditoría,
 * BiBuru usa «Creator's draft» (el vídeo llega a la bandeja de TikTok y lo publicas tú) o la publicación asistida.
 * Documentación: developers.tiktok.com/doc/login-kit-web, /content-posting-api-get-started, /tiktok-api-v2-video-object
 */
type Fetch = typeof fetch;
export const TT_API = "https://open.tiktokapis.com/v2";

export class TtError extends Error {
  constructor(message: string, readonly status?: number, readonly expired = false, readonly retryable = true) { super(message); }
}

export function tiktokConfig() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim(), clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
  return clientKey && clientSecret ? { clientKey, clientSecret } : null;
}
export const ttRedirectUri = (origin: string) => process.env.TIKTOK_REDIRECT_URI?.trim() || `${origin}/api/tiktok/callback`;
/** Permisos: lectura de perfil, estadísticas y vídeos + subir como borrador. `video.publish` solo si la app está auditada. */
export function ttScopes(audited = process.env.TIKTOK_DIRECT_POST_AUDITED === "1") {
  return ["user.info.basic", "user.info.profile", "user.info.stats", "video.list", "video.upload", ...(audited ? ["video.publish"] : [])];
}

export function ttAuthUrl(o: { clientKey: string; redirectUri: string; state: string; scopes?: string[] }) {
  const p = new URLSearchParams({ client_key: o.clientKey, scope: (o.scopes ?? ttScopes()).join(","), response_type: "code", redirect_uri: o.redirectUri, state: o.state });
  return `https://www.tiktok.com/v2/auth/authorize/?${p}`;
}

async function readJson(res: Response) {
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { code?: string; message?: string } | string; error_description?: string; data?: Record<string, unknown> };
  const code = typeof j.error === "object" ? j.error?.code : j.error;
  if (!res.ok || (code && code !== "ok")) {
    const msg = typeof j.error === "object" ? j.error?.message : j.error_description;
    const expired = code === "access_token_invalid" || code === "invalid_grant" || res.status === 401;
    const retryable = !expired && (res.status >= 500 || res.status === 429 || code === "rate_limit_exceeded" || code === "internal_error");
    throw new TtError(`TikTok: ${(msg || code || String(res.status)).slice(0, 250)}`, res.status, expired, retryable);
  }
  return j;
}

export type TtTokens = { accessToken: string; expiresIn: number; refreshToken: string; refreshExpiresIn: number; openId: string; scope: string };
async function token(body: Record<string, string>, f: Fetch): Promise<TtTokens> {
  const cfg = tiktokConfig();
  if (!cfg) throw new TtError("Faltan TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET", undefined, false, false);
  const j = await readJson(await f(`${TT_API}/oauth/token/`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ client_key: cfg.clientKey, client_secret: cfg.clientSecret, ...body }),
  }));
  return { accessToken: String(j.access_token), expiresIn: Number(j.expires_in ?? 86400), refreshToken: String(j.refresh_token), refreshExpiresIn: Number(j.refresh_expires_in ?? 31536000), openId: String(j.open_id ?? ""), scope: String(j.scope ?? "") };
}
export const ttExchangeCode = (code: string, redirectUri: string, f: Fetch = fetch) => token({ code, grant_type: "authorization_code", redirect_uri: redirectUri }, f);
export const ttRefresh = (refreshToken: string, f: Fetch = fetch) => token({ grant_type: "refresh_token", refresh_token: refreshToken }, f);

const authed = (tokenStr: string, init: RequestInit = {}): RequestInit => ({ ...init, headers: { Authorization: `Bearer ${tokenStr}`, "Content-Type": "application/json; charset=UTF-8", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30000) });

export type TtProfile = { openId: string; username: string | null; name: string | null; avatar: string | null; followers: number | null; likes: number | null; videos: number | null };
export async function ttProfile(tokenStr: string, f: Fetch = fetch): Promise<TtProfile> {
  const j = await readJson(await f(`${TT_API}/user/info/?fields=open_id,avatar_url,display_name,username,follower_count,likes_count,video_count`, authed(tokenStr)));
  const u = ((j.data as { user?: Record<string, unknown> })?.user ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" ? v : null);
  return { openId: String(u.open_id ?? ""), username: (u.username as string) ?? null, name: (u.display_name as string) ?? null, avatar: (u.avatar_url as string) ?? null, followers: n(u.follower_count), likes: n(u.likes_count), videos: n(u.video_count) };
}

export type TtVideo = { id: string; caption: string | null; cover: string | null; url: string | null; createdAt: string; views: number; likes: number; comments: number; shares: number };
/** Vídeos públicos recientes con sus contadores acumulados (hasta `pages` páginas de 20). */
export async function ttVideos(tokenStr: string, pages = 2, f: Fetch = fetch): Promise<TtVideo[]> {
  const out: TtVideo[] = [];
  let cursor: number | undefined;
  for (let i = 0; i < pages; i++) {
    const j = await readJson(await f(`${TT_API}/video/list/?fields=id,title,video_description,cover_image_url,share_url,create_time,view_count,like_count,comment_count,share_count`, authed(tokenStr, { method: "POST", body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }) })));
    const d = (j.data ?? {}) as { videos?: Record<string, unknown>[]; cursor?: number; has_more?: boolean };
    for (const v of d.videos ?? []) out.push({
      id: String(v.id), caption: ((v.video_description || v.title) as string)?.slice(0, 2500) ?? null, cover: (v.cover_image_url as string) ?? null, url: (v.share_url as string) ?? null,
      createdAt: new Date(Number(v.create_time ?? 0) * 1000).toISOString(), views: Number(v.view_count ?? 0), likes: Number(v.like_count ?? 0), comments: Number(v.comment_count ?? 0), shares: Number(v.share_count ?? 0),
    });
    if (!d.has_more) break;
    cursor = d.cursor;
  }
  return out;
}

/** Opciones de privacidad que TikTok permite ahora a esta cuenta (obligatorio consultarlo antes de una publicación directa). */
export async function ttCreatorInfo(tokenStr: string, f: Fetch = fetch): Promise<{ privacyOptions: string[]; maxDurationSec: number | null }> {
  const j = await readJson(await f(`${TT_API}/post/publish/creator_info/query/`, authed(tokenStr, { method: "POST", body: "{}" })));
  const d = (j.data ?? {}) as { privacy_level_options?: string[]; max_video_post_duration_sec?: number };
  return { privacyOptions: d.privacy_level_options ?? [], maxDurationSec: d.max_video_post_duration_sec ?? null };
}

/** Privacidad a usar: sin auditoría, siempre SELF_ONLY (TikTok lo fuerza igualmente); auditada, pública si se puede. */
export function ttPrivacy(options: string[], audited: boolean): string {
  if (!audited) return "SELF_ONLY";
  return options.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : options[0] ?? "SELF_ONLY";
}

/**
 * Inicia una subida de archivo (un solo trozo: los archivos son de 50 MB como mucho).
 * mode "draft" → bandeja de TikTok (video.upload); "direct" → publicación directa (video.publish).
 */
export async function ttInitUpload(tokenStr: string, o: { mode: "draft" | "direct"; size: number; title?: string; privacy?: string }, f: Fetch = fetch): Promise<{ publishId: string; uploadUrl: string }> {
  const source_info = { source: "FILE_UPLOAD", video_size: o.size, chunk_size: o.size, total_chunk_count: 1 };
  const body = o.mode === "draft" ? { source_info } : { source_info, post_info: { title: (o.title ?? "").slice(0, 2200), privacy_level: o.privacy ?? "SELF_ONLY", disable_comment: false, disable_duet: false, disable_stitch: false } };
  const j = await readJson(await f(`${TT_API}/post/publish/${o.mode === "draft" ? "inbox/" : ""}video/init/`, authed(tokenStr, { method: "POST", body: JSON.stringify(body) })));
  const d = (j.data ?? {}) as { publish_id?: string; upload_url?: string };
  if (!d.publish_id || !d.upload_url) throw new TtError("TikTok no devolvió dónde subir el vídeo");
  return { publishId: d.publish_id, uploadUrl: d.upload_url };
}

/** Sube el vídeo entero al upload_url que dio TikTok. */
export async function ttUpload(uploadUrl: string, bytes: Buffer, mime: string, f: Fetch = fetch) {
  if (!/^https:\/\/[^/]*tiktokapis\.com\//.test(uploadUrl)) throw new TtError("Dirección de subida no válida", undefined, false, false);
  const res = await f(uploadUrl, { method: "PUT", headers: { "Content-Type": mime, "Content-Length": String(bytes.length), "Content-Range": `bytes 0-${bytes.length - 1}/${bytes.length}` }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(120000) });
  if (!res.ok && res.status !== 201) throw new TtError(`TikTok rechazó la subida (${res.status})`, res.status);
}

/** Estado: PROCESSING_UPLOAD / PROCESSING_DOWNLOAD / SEND_TO_USER_INBOX / PUBLISH_COMPLETE / FAILED. */
export async function ttPublishStatus(tokenStr: string, publishId: string, f: Fetch = fetch): Promise<{ status: string; reason: string | null; postId: string | null }> {
  const j = await readJson(await f(`${TT_API}/post/publish/status/fetch/`, authed(tokenStr, { method: "POST", body: JSON.stringify({ publish_id: publishId }) })));
  const d = (j.data ?? {}) as { status?: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] };
  return { status: d.status ?? "PROCESSING_UPLOAD", reason: d.fail_reason ?? null, postId: d.publicaly_available_post_id?.[0] != null ? String(d.publicaly_available_post_id[0]) : null };
}

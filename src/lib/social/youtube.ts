/**
 * YouTube para publicar Shorts (YouTube Data API v3). Usa el mismo cliente OAuth de Google que Favoritos (GOOGLE_CLIENT_ID),
 * pero con otro permiso (`youtube.upload`) y otra vuelta (`/api/youtube/callback`), y la cuenta se guarda en `social_accounts`.
 * Un Short es un vídeo normal vertical o cuadrado de 3 min como mucho: YouTube lo clasifica solo.
 * Mientras Google no verifique el proyecto, los vídeos subidos por la API quedan en privado.
 * Cuota: subir cuesta 1.600 de las 10.000 unidades diarias (unos 6 Shorts al día).
 * Documentación: developers.google.com/youtube/v3/docs/videos/insert y /guides/using_resumable_upload_protocol
 */
type Fetch = typeof fetch;

export const YT_SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];
export const ytRedirectUri = (origin: string) => process.env.YOUTUBE_REDIRECT_URI?.trim() || `${origin}/api/youtube/callback`;
export const YT_PRIVACY = ["public", "unlisted", "private"] as const;

export class YtError extends Error {
  constructor(message: string, readonly status?: number, readonly expired = false, readonly retryable = true) { super(message); }
}

export function ytAuthUrl(o: { clientId: string; redirectUri: string; state: string }) {
  const p = new URLSearchParams({
    client_id: o.clientId, redirect_uri: o.redirectUri, response_type: "code", scope: YT_SCOPES.join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: o.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function fail(res: Response): Promise<never> {
  const j = (await res.json().catch(() => ({}))) as { error?: { message?: string; errors?: { reason?: string }[] } };
  const reason = j.error?.errors?.[0]?.reason ?? "";
  if (reason === "quotaExceeded" || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") throw new YtError("YouTube: cuota diaria agotada; se reintenta más tarde.", res.status);
  if (reason === "uploadLimitExceeded") throw new YtError("YouTube: el canal ha llegado a su límite de subidas por hoy.", res.status);
  const expired = res.status === 401;
  const retryable = !expired && (res.status >= 500 || res.status === 429);
  throw new YtError(`YouTube: ${(j.error?.message ?? `HTTP ${res.status}`).slice(0, 250)}`, res.status, expired, retryable);
}

export type YtChannel = { id: string; title: string | null; handle: string | null; avatar: string | null; subscribers: number | null };
export async function ytChannel(token: string, f: Fetch = fetch): Promise<YtChannel> {
  const res = await f("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) await fail(res);
  const j = (await res.json()) as { items?: { id: string; snippet?: { title?: string; customUrl?: string; thumbnails?: Record<string, { url?: string }> }; statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }[] };
  const c = j.items?.[0];
  if (!c) throw new YtError("Esta cuenta de Google no tiene canal de YouTube. Crea uno en youtube.com y vuelve a conectar.", 404, false, false);
  const subs = c.statistics?.hiddenSubscriberCount ? null : Number(c.statistics?.subscriberCount ?? NaN);
  return {
    id: c.id, title: c.snippet?.title?.slice(0, 200) ?? null, handle: c.snippet?.customUrl?.replace(/^@/, "").slice(0, 200) ?? null,
    avatar: (c.snippet?.thumbnails?.default ?? c.snippet?.thumbnails?.medium)?.url ?? null, subscribers: Number.isFinite(subs) ? subs : null,
  };
}

/** Título de YouTube: máx. 100 caracteres, sin «<» ni «>» (los rechaza). */
export const ytTitle = (title: string | null | undefined, caption: string) =>
  ((title?.trim() || caption.split("\n").find((l) => l.trim())?.trim() || "Short").replace(/[<>]/g, "").slice(0, 100));

export type YtUploadInput = { title: string; description: string; privacy: string; madeForKids: boolean; tags?: string[] };

/** Subida reanudable en dos pasos: pedir la dirección de subida y enviar el vídeo entero. Devuelve el id del vídeo. */
export async function ytUpload(token: string, video: { bytes: Buffer; mime: string }, o: YtUploadInput, f: Fetch = fetch): Promise<string> {
  const meta = {
    snippet: { title: o.title, description: o.description.replace(/[<>]/g, "").slice(0, 5000), categoryId: "22", ...(o.tags?.length ? { tags: o.tags.slice(0, 30) } : {}) },
    status: { privacyStatus: (YT_PRIVACY as readonly string[]).includes(o.privacy) ? o.privacy : "public", selfDeclaredMadeForKids: o.madeForKids },
  };
  const init = await f("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(video.bytes.length), "X-Upload-Content-Type": video.mime },
    body: JSON.stringify(meta),
  });
  if (!init.ok) await fail(init);
  const location = init.headers.get("location");
  if (!location || !/^https:\/\/[^/]*googleapis\.com\//.test(location)) throw new YtError("YouTube no devolvió dónde subir el vídeo");
  const res = await f(location, { method: "PUT", headers: { "Content-Type": video.mime, "Content-Length": String(video.bytes.length) }, body: new Uint8Array(video.bytes), signal: AbortSignal.timeout(240000) });
  if (!res.ok) await fail(res);
  const j = (await res.json().catch(() => ({}))) as { id?: string };
  if (!j.id) throw new YtError("YouTube no confirmó la subida");
  return j.id;
}

/** Hashtags de la publicación como etiquetas de YouTube (sin #). */
export const ytTags = (hashtags: string) => [...new Set(hashtags.split(/[\s,]+/).map((h) => h.replace(/^#/, "").trim()).filter(Boolean))];

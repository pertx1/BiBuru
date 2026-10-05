import "server-only";
import { parseIsoDuration } from "./url";

/**
 * Cliente mínimo de la API de YouTube Data v3 y del OAuth de Google (solo lectura: `youtube.readonly`).
 * Cuota gratuita: 10.000 unidades/día; listar 50 elementos cuesta 1 unidad, así que sincronizar es casi gratis.
 * Importante: la lista «Ver más tarde» NO es accesible por la API (Google la cerró en 2016); solo Me gusta y listas propias.
 */
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/youtube.readonly", "openid", "email"];
type Fetch = typeof fetch;

export function googleConfig() {
  const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return null;
  return { clientId: id, clientSecret: secret };
}

/** URI de retorno registrada en Google Cloud: variable GOOGLE_REDIRECT_URI o, por defecto, el dominio actual. */
export const redirectUriFor = (origin: string) => process.env.GOOGLE_REDIRECT_URI?.trim() || `${origin}/api/google/callback`;

export function buildAuthUrl(o: { clientId: string; redirectUri: string; state: string }): string {
  const p = new URLSearchParams({
    client_id: o.clientId, redirect_uri: o.redirectUri, response_type: "code", scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: o.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(body: Record<string, string>, f: Fetch) {
  const cfg = googleConfig();
  if (!cfg) throw new Error("Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET");
  const res = await f("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...body }), signal: AbortSignal.timeout(10000),
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new GoogleError(String(j.error_description ?? j.error ?? `HTTP ${res.status}`), res.status, j.error === "invalid_grant");
  return j;
}

export class GoogleError extends Error {
  constructor(message: string, readonly status?: number, readonly revoked = false) { super(message); }
}

export async function exchangeCode(code: string, redirectUri: string, f: Fetch = fetch) {
  const j = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri }, f);
  return { refreshToken: (j.refresh_token as string | undefined) ?? null, accessToken: String(j.access_token), scope: String(j.scope ?? "") };
}

/** Access token de corta duración a partir del refresh token guardado. `revoked` = la persona quitó el acceso. */
export async function refreshAccessToken(refreshToken: string, f: Fetch = fetch): Promise<string> {
  const j = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }, f);
  return String(j.access_token);
}

export async function accountEmail(accessToken: string, f: Fetch = fetch): Promise<string | null> {
  const res = await f("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  const j = res?.ok ? ((await res.json().catch(() => null)) as { email?: string } | null) : null;
  return j?.email?.slice(0, 200) ?? null;
}

async function api<T>(path: string, params: Record<string, string>, token: string, f: Fetch): Promise<T> {
  const res = await f(`https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string; errors?: { reason?: string }[] } };
    const reason = j.error?.errors?.[0]?.reason;
    throw new GoogleError(reason === "quotaExceeded" ? "Cuota diaria de YouTube agotada; se reintenta mañana." : (j.error?.message ?? `HTTP ${res.status}`).slice(0, 250), res.status);
  }
  return (await res.json()) as T;
}

export type YtVideo = { id: string; title: string; channel: string | null; thumbnail: string | null; durationSec: number | null; publishedAt: string | null; description: string | null };
type VideoItem = { id: string; snippet?: { title?: string; description?: string; channelTitle?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> }; contentDetails?: { duration?: string } };

export const toYtVideo = (v: VideoItem): YtVideo => ({
  id: v.id, title: (v.snippet?.title ?? "").slice(0, 300), channel: v.snippet?.channelTitle?.slice(0, 200) ?? null,
  thumbnail: (v.snippet?.thumbnails?.medium ?? v.snippet?.thumbnails?.default)?.url ?? null,
  durationSec: parseIsoDuration(v.contentDetails?.duration), publishedAt: v.snippet?.publishedAt ?? null,
  description: v.snippet?.description?.slice(0, 1500) ?? null,
});

/** Detalles (incluida la duración) de hasta 50 vídeos por llamada. */
export async function videoDetails(token: string, ids: string[], f: Fetch = fetch): Promise<YtVideo[]> {
  const out: YtVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await api<{ items?: VideoItem[] }>("videos", { part: "snippet,contentDetails", id: ids.slice(i, i + 50).join(","), maxResults: "50" }, token, f);
    out.push(...(j.items ?? []).map(toYtVideo));
  }
  return out;
}

/** Una página de «Me gusta» (50 vídeos, 1 unidad de cuota). */
export async function likedPage(token: string, pageToken?: string, f: Fetch = fetch) {
  const j = await api<{ items?: VideoItem[]; nextPageToken?: string }>("videos", { part: "snippet,contentDetails", myRating: "like", maxResults: "50", ...(pageToken ? { pageToken } : {}) }, token, f);
  return { videos: (j.items ?? []).map(toYtVideo), next: j.nextPageToken ?? null };
}

export async function myPlaylists(token: string, f: Fetch = fetch): Promise<{ id: string; title: string; count: number }[]> {
  const out: { id: string; title: string; count: number }[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 4; i++) {
    const j: { items?: { id: string; snippet?: { title?: string }; contentDetails?: { itemCount?: number } }[]; nextPageToken?: string } =
      await api("playlists", { part: "snippet,contentDetails", mine: "true", maxResults: "50", ...(pageToken ? { pageToken } : {}) }, token, f);
    out.push(...(j.items ?? []).map((p) => ({ id: p.id, title: (p.snippet?.title ?? "Lista").slice(0, 120), count: p.contentDetails?.itemCount ?? 0 })));
    pageToken = j.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

export async function playlistPage(token: string, playlistId: string, pageToken?: string, f: Fetch = fetch) {
  const j = await api<{ items?: { contentDetails?: { videoId?: string } }[]; nextPageToken?: string }>("playlistItems", { part: "contentDetails", playlistId, maxResults: "50", ...(pageToken ? { pageToken } : {}) }, token, f);
  return { ids: (j.items ?? []).map((x) => x.contentDetails?.videoId).filter((x): x is string => !!x), next: j.nextPageToken ?? null };
}

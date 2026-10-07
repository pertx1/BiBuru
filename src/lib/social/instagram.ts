/**
 * Instagram API con inicio de sesión de Instagram (cuentas profesionales: empresa o creador), en graph.instagram.com.
 * Funciona con la app de Meta en modo desarrollo para las cuentas que tengan un rol en la app (acceso estándar).
 * Documentación: developers.facebook.com/docs/instagram-platform (login, insights y content-publishing).
 */
type Fetch = typeof fetch;

export const IG_SCOPES = ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"];
export const IG_GRAPH = "https://graph.instagram.com";
const V = process.env.INSTAGRAM_API_VERSION?.trim() || "v23.0";
export const igApi = (path: string) => `${IG_GRAPH}/${V}${path}`;

export class IgError extends Error {
  constructor(message: string, readonly status?: number, readonly expired = false, readonly retryable = true) { super(message); }
}

export function instagramConfig() {
  const appId = process.env.INSTAGRAM_APP_ID?.trim(), appSecret = process.env.INSTAGRAM_APP_SECRET?.trim();
  return appId && appSecret ? { appId, appSecret } : null;
}
export const igRedirectUri = (origin: string) => process.env.INSTAGRAM_REDIRECT_URI?.trim() || `${origin}/api/instagram/callback`;

export function igAuthUrl(o: { appId: string; redirectUri: string; state: string }) {
  const p = new URLSearchParams({ client_id: o.appId, redirect_uri: o.redirectUri, response_type: "code", scope: IG_SCOPES.join(","), state: o.state, enable_fb_login: "0", force_reauth: "true" });
  return `https://www.instagram.com/oauth/authorize?${p}`;
}

async function readJson(res: Response) {
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string; code?: number; type?: string; error_subcode?: number } };
  if (!res.ok || j.error) {
    const code = j.error?.code;
    const expired = code === 190 || res.status === 401;
    const retryable = !expired && (res.status >= 500 || res.status === 429 || code === 4 || code === 17 || code === 32 || code === 613 || code === 2);
    throw new IgError(`Instagram: ${(j.error?.message ?? String(res.status)).slice(0, 250)}`, res.status, expired, retryable);
  }
  return j;
}

/** Código → token corto (1 h) → token largo (60 días). */
export async function igExchangeCode(code: string, redirectUri: string, f: Fetch = fetch) {
  const cfg = instagramConfig();
  if (!cfg) throw new IgError("Faltan INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET", undefined, false, false);
  const short = await readJson(await f("https://api.instagram.com/oauth/access_token", {
    method: "POST", signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ client_id: cfg.appId, client_secret: cfg.appSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code: code.replace(/#_$/, "") }),
  }));
  const shortToken = String(short.access_token ?? ""), permissions = Array.isArray(short.permissions) ? (short.permissions as string[]).join(",") : String(short.permissions ?? "");
  const long = await readJson(await f(`${IG_GRAPH}/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: cfg.appSecret, access_token: shortToken })}`, { signal: AbortSignal.timeout(15000) }));
  return { accessToken: String(long.access_token), expiresIn: Number(long.expires_in ?? 5_184_000), userId: String(short.user_id ?? ""), scopes: permissions };
}

/** Renueva un token largo (vale si tiene más de 24 h y no ha caducado): otros 60 días. */
export async function igRefresh(token: string, f: Fetch = fetch) {
  const j = await readJson(await f(`${IG_GRAPH}/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token })}`, { signal: AbortSignal.timeout(15000) }));
  return { accessToken: String(j.access_token), expiresIn: Number(j.expires_in ?? 5_184_000) };
}

const get = async (url: string, token: string, f: Fetch) => readJson(await f(`${url}${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(20000) }));
const post = async (url: string, token: string, body: Record<string, string>, f: Fetch) =>
  readJson(await f(url, { method: "POST", signal: AbortSignal.timeout(30000), body: new URLSearchParams({ ...body, access_token: token }) }));

export type IgProfile = { id: string; username: string | null; name: string | null; avatar: string | null; accountType: string | null; followers: number | null; mediaCount: number | null };
export async function igProfile(token: string, f: Fetch = fetch): Promise<IgProfile> {
  const j = await get(igApi("/me?fields=user_id,username,name,account_type,profile_picture_url,followers_count,media_count"), token, f);
  const n = (v: unknown) => (typeof v === "number" ? v : null);
  return { id: String(j.user_id ?? j.id), username: (j.username as string) ?? null, name: (j.name as string) ?? null, avatar: (j.profile_picture_url as string) ?? null, accountType: (j.account_type as string) ?? null, followers: n(j.followers_count), mediaCount: n(j.media_count) };
}

/** Métricas de la cuenta de UN día (total_value entre since y until). `impressions` ya no existe: se usa `views`. */
export const IG_DAY_METRICS = ["reach", "views", "total_interactions", "likes", "comments", "shares", "saves", "profile_views"];
export async function igDayInsights(token: string, igUserId: string, dayStartUnix: number, f: Fetch = fetch): Promise<Record<string, number>> {
  const qs = new URLSearchParams({ metric: IG_DAY_METRICS.join(","), period: "day", metric_type: "total_value", since: String(dayStartUnix), until: String(dayStartUnix + 86400) });
  const j = await get(igApi(`/${igUserId}/insights?${qs}`), token, f);
  const out: Record<string, number> = {};
  for (const m of (j.data as { name: string; total_value?: { value?: number } }[] | undefined) ?? []) if (typeof m.total_value?.value === "number") out[m.name] = m.total_value.value;
  return out;
}

export type IgMedia = { id: string; caption: string | null; mediaType: string | null; permalink: string | null; thumbnail: string | null; postedAt: string; likes: number | null; comments: number | null };
export async function igRecentMedia(token: string, limit = 30, f: Fetch = fetch): Promise<IgMedia[]> {
  const j = await get(igApi(`/me/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count&limit=${limit}`), token, f);
  return ((j.data as Record<string, unknown>[] | undefined) ?? []).map((m) => ({
    id: String(m.id), caption: (m.caption as string)?.slice(0, 2500) ?? null, mediaType: ((m.media_product_type === "REELS" ? "REELS" : m.media_type) as string) ?? null,
    permalink: (m.permalink as string) ?? null, thumbnail: ((m.thumbnail_url ?? (m.media_type === "IMAGE" || m.media_type === "CAROUSEL_ALBUM" ? m.media_url : null)) as string) ?? null,
    postedAt: String(m.timestamp), likes: typeof m.like_count === "number" ? m.like_count : null, comments: typeof m.comments_count === "number" ? m.comments_count : null,
  }));
}

/** Métricas de una publicación (alcance, visualizaciones, interacciones, guardados, compartidos). Si alguna no aplica, se ignora. */
export async function igMediaInsights(token: string, mediaId: string, f: Fetch = fetch): Promise<Record<string, number>> {
  try {
    const j = await get(igApi(`/${mediaId}/insights?metric=reach,views,total_interactions,saved,shares`), token, f);
    const out: Record<string, number> = {};
    for (const m of (j.data as { name: string; values?: { value?: number }[]; total_value?: { value?: number } }[] | undefined) ?? []) {
      const v = m.total_value?.value ?? m.values?.[0]?.value;
      if (typeof v === "number") out[m.name] = v;
    }
    return out;
  } catch { return {}; }
}

// ---------------------------------------------------------------- publicación (contenedor → estado → publicar)
export type IgPublishInput = { kind: "image" | "carousel" | "reel"; urls: { url: string; video: boolean }[]; caption: string };

/** Paso 1: crea el contenedor (para carrusel, primero uno por elemento). Devuelve su id. */
export async function igCreateContainer(token: string, igUserId: string, p: IgPublishInput, f: Fetch = fetch): Promise<string> {
  const url = igApi(`/${igUserId}/media`);
  if (p.kind === "image") return String((await post(url, token, { image_url: p.urls[0].url, caption: p.caption }, f)).id);
  if (p.kind === "reel") return String((await post(url, token, { media_type: "REELS", video_url: p.urls[0].url, caption: p.caption, share_to_feed: "true" }, f)).id);
  const children: string[] = [];
  for (const u of p.urls.slice(0, 10)) children.push(String((await post(url, token, u.video ? { media_type: "VIDEO", video_url: u.url, is_carousel_item: "true" } : { image_url: u.url, is_carousel_item: "true" }, f)).id));
  return String((await post(url, token, { media_type: "CAROUSEL", children: children.join(","), caption: p.caption }, f)).id);
}

/** Estado del contenedor: FINISHED (listo), IN_PROGRESS (aún procesando vídeo), ERROR / EXPIRED. */
export async function igContainerStatus(token: string, containerId: string, f: Fetch = fetch): Promise<string> {
  return String((await get(igApi(`/${containerId}?fields=status_code`), token, f)).status_code ?? "IN_PROGRESS");
}

/** Paso 3: publica y devuelve el id y el enlace de la publicación. */
export async function igPublish(token: string, igUserId: string, containerId: string, f: Fetch = fetch): Promise<{ id: string; permalink: string | null }> {
  const id = String((await post(igApi(`/${igUserId}/media_publish`), token, { creation_id: containerId }, f)).id);
  const j = await get(igApi(`/${id}?fields=permalink`), token, f).catch(() => ({ permalink: null }));
  return { id, permalink: (j.permalink as string) ?? null };
}

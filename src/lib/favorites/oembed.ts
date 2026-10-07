import "server-only";
import { TT_SHORT_HOSTS, parseHttpUrl } from "./url";

/**
 * Metadatos públicos de un enlace mediante oEmbed (el método oficial; sin scraping ni descargas de vídeo).
 * Solo se llama a dominios conocidos, así que no hay riesgo de que un enlace nos haga pedir direcciones internas (SSRF).
 */
export type OEmbed = { title: string; author: string | null; thumbnail: string | null };
type Fetch = typeof fetch;

async function getJson(url: string, f: Fetch): Promise<Record<string, unknown> | null> {
  const res = await f(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" }, redirect: "error" }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

const asStr = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/**
 * Como `tiktokOembed`, pero distingue «no disponible» (TikTok responde 400/404: vídeo privado o borrado) de un fallo de red.
 */
export async function tiktokOembedStatus(videoUrl: string, f: Fetch = fetch): Promise<OEmbed | "unavailable" | null> {
  const u = parseHttpUrl(videoUrl);
  if (!u || !(u.hostname === "www.tiktok.com" || u.hostname === "tiktok.com")) return null;
  const res = await f(`https://www.tiktok.com/oembed?url=${encodeURIComponent(u.toString())}`, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" }, redirect: "error" }).catch(() => null);
  if (!res) return null;
  if (res.status === 400 || res.status === 404) return "unavailable"; // 403/429 = bloqueo temporal: no se marca
  if (!res.ok) return null;
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!j) return null;
  if (typeof j.code === "number" && j.code !== 0) return "unavailable"; // a veces responde 200 con un código de error
  return { title: asStr(j.title, 300) ?? "Vídeo de TikTok", author: asStr(j.author_name, 200), thumbnail: asStr(j.thumbnail_url, 2000) };
}

export async function tiktokOembed(videoUrl: string, f: Fetch = fetch): Promise<OEmbed | null> {
  const u = parseHttpUrl(videoUrl);
  if (!u || !(u.hostname === "www.tiktok.com" || u.hostname === "tiktok.com")) return null;
  const j = await getJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(u.toString())}`, f);
  if (!j) return null;
  return { title: asStr(j.title, 300) ?? "Vídeo de TikTok", author: asStr(j.author_name, 200), thumbnail: asStr(j.thumbnail_url, 2000) };
}

export async function youtubeOembed(videoUrl: string, f: Fetch = fetch): Promise<OEmbed | null> {
  const j = await getJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(videoUrl)}`, f);
  if (!j) return null;
  return { title: asStr(j.title, 300) ?? "Vídeo de YouTube", author: asStr(j.author_name, 200), thumbnail: asStr(j.thumbnail_url, 2000) };
}

/**
 * Los enlaces cortos de TikTok (vm./vt.tiktok.com) redirigen al vídeo real. Se sigue la redirección a mano, como
 * mucho 3 saltos y solo si siguen dentro de tiktok.com.
 */
export async function resolveTiktokShort(shortUrl: string, f: Fetch = fetch): Promise<string | null> {
  let current = parseHttpUrl(shortUrl);
  for (let i = 0; i < 3 && current; i++) {
    const host = current.hostname.toLowerCase();
    if (!(TT_SHORT_HOSTS.has(host) || host === "www.tiktok.com" || host === "tiktok.com")) return null;
    if (/\/video\/\d+/.test(current.pathname)) return `${current.origin}${current.pathname}`;
    const res = await f(current.toString(), { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0 (compatible; BiBuru/1.0)" } }).catch(() => null);
    const loc = res?.headers.get("location");
    if (!loc) return null;
    current = parseHttpUrl(new URL(loc, current).toString());
  }
  return null;
}

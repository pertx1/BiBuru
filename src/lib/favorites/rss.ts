/**
 * Listas de YouTube por RSS: el feed público de una lista (sin claves ni Google Cloud).
 * Solo se pide a www.youtube.com con un id validado, así que un enlace no puede hacernos llamar a otro sitio (anti-SSRF).
 * Límites de YouTube: el feed trae unos 15 vídeos y no muestra vídeos privados ni ocultos.
 */
export type FeedEntry = { id: string; title: string; channel: string | null; publishedAt: string | null; thumbnail: string | null };
export type Feed = { title: string | null; entries: FeedEntry[] };
type Fetch = typeof fetch;

const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,64}$/;
const YT_HOSTS = new Set(["www.youtube.com", "youtube.com", "m.youtube.com", "music.youtube.com"]);

/** Saca el id de lista de un enlace (…?list=PL…) o lo acepta tal cual. «Me gusta» (LL) y «Ver más tarde» (WL) no valen: son privadas. */
export function parsePlaylistId(raw: string): string | null {
  const text = raw.trim();
  let id: string | null = text;
  if (/^https?:\/\//i.test(text)) {
    try {
      const u = new URL(text);
      id = YT_HOSTS.has(u.hostname) ? u.searchParams.get("list") : null;
    } catch {
      return null;
    }
  }
  if (!id || !PLAYLIST_ID.test(id)) return null;
  return id;
}

export const feedUrl = (playlistId: string) => `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .trim();
}
const tag = (xml: string, name: string) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]) : null; };

/** Interpreta el Atom de YouTube. Tolerante: ignora entradas sin id válido. */
export function parseFeed(xml: string): Feed {
  const head = xml.split("<entry")[0];
  const entries: FeedEntry[] = [];
  for (const m of xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/g)) {
    const e = m[0];
    const id = tag(e, "yt:videoId");
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) continue;
    const author = e.match(/<author>[\s\S]*?<\/author>/)?.[0];
    const thumb = e.match(/<media:thumbnail[^>]*\surl="([^"]+)"/)?.[1];
    const published = tag(e, "published");
    entries.push({
      id,
      title: (tag(e, "title") ?? "Vídeo de YouTube").slice(0, 300),
      channel: author ? (tag(author, "name")?.slice(0, 200) ?? null) : null,
      publishedAt: published && !Number.isNaN(Date.parse(published)) ? new Date(published).toISOString() : null,
      thumbnail: thumb && /^https:\/\/[a-z0-9.-]*ytimg\.com\//i.test(decode(thumb)) ? decode(thumb) : null,
    });
  }
  return { title: tag(head, "title")?.slice(0, 200) ?? null, entries };
}

export class FeedError extends Error {}

/** Descarga y lee el feed de una lista. Lanza FeedError con un mensaje para la persona. */
export async function fetchPlaylistFeed(playlistId: string, f: Fetch = fetch): Promise<Feed> {
  if (!PLAYLIST_ID.test(playlistId)) throw new FeedError("El id de la lista no es válido.");
  const res = await f(feedUrl(playlistId), { signal: AbortSignal.timeout(10000), redirect: "error", headers: { Accept: "application/atom+xml, application/xml" } }).catch(() => null);
  if (!res) throw new FeedError("No se pudo contactar con YouTube. Se reintentará más tarde.");
  if (res.status === 404) throw new FeedError("YouTube no encuentra la lista: comprueba que es Pública (u Oculta) y no Privada.");
  if (!res.ok) throw new FeedError(`YouTube respondió con un error (${res.status}). Se reintentará más tarde.`);
  const text = await res.text();
  if (!text.includes("<feed")) throw new FeedError("YouTube devolvió algo inesperado. Se reintentará más tarde.");
  return parseFeed(text.slice(0, 2_000_000));
}

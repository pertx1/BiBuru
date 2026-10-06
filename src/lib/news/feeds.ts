/**
 * Lectura de feeds (RSS 2.0, Atom, YouTube, Google News, Mastodon) y del JSON público de Bluesky.
 * Solo se extrae titular, entradilla, enlace, autor/medio, fecha e imagen declarada. Nada del artículo completo.
 */
import { decodeEntities, plainSnippet } from "./text";

export type RawItem = {
  title: string;
  url: string;
  snippet: string | null;
  author: string | null;
  outlet: string | null;      // medio (Google News trae el medio real en <source>)
  publishedAt: string | null; // ISO
  imageUrl: string | null;    // https solamente
};

const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]).trim() : null;
};
const attr = (xml: string, el: string, a: string): string | null => {
  const m = xml.match(new RegExp(`<${el}\\b[^>]*\\s${a}="([^"]+)"`, "i"));
  return m ? decodeEntities(m[1]) : null;
};
const httpsImage = (u: string | null | undefined): string | null => {
  if (!u) return null;
  const s = u.trim().replace(/^http:\/\//i, "https://");
  return /^https:\/\/[^\s"'<>]+$/i.test(s) && s.length <= 2000 ? s : null;
};
const iso = (d: string | null): string | null => {
  if (!d) return null;
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/** Primera imagen declarada por la entrada: media:content/thumbnail, enclosure de imagen, o <img> de la entradilla. */
function imageOf(entry: string, html: string | null): string | null {
  const media = entry.match(/<media:(?:content|thumbnail)\b[^>]*\surl="([^"]+)"[^>]*>/i);
  if (media && !/\smedium="(video|audio)"/i.test(media[0])) return httpsImage(decodeEntities(media[1]));
  const enc = entry.match(/<enclosure\b[^>]*>/i)?.[0];
  if (enc && /type="image\//i.test(enc)) return httpsImage(attr(enc, "enclosure", "url"));
  const img = html ? decodeEntities(html).match(/<img\b[^>]*\ssrc="([^"]+)"/i) : null;
  return img ? httpsImage(img[1]) : null;
}

export function parseFeed(xml: string): { title: string | null; items: RawItem[] } {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const head = xml.split(isAtom ? /<entry[\s>]/i : /<item[\s>]/i)[0];
  const feedTitle = tag(head, "title");
  const blocks = xml.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const items: RawItem[] = [];
  for (const e of blocks) {
    const title = plainSnippet(tag(e, "title"), 400);
    let url: string | null;
    if (isAtom) {
      const alt = e.match(/<link\b[^>]*rel="alternate"[^>]*>/i)?.[0] ?? e.match(/<link\b[^>]*>/i)?.[0] ?? "";
      url = attr(alt, "link", "href");
    } else {
      url = tag(e, "link") ?? attr(e, "link", "href") ?? (tag(e, "guid")?.startsWith("http") ? tag(e, "guid") : null);
    }
    const videoId = tag(e, "yt:videoId");
    const html = tag(e, "content:encoded") ?? tag(e, "description") ?? tag(e, "summary") ?? tag(e, "content") ?? tag(e, "media:description");
    if (!title || !url || !/^https?:\/\//i.test(url)) continue;
    const sourceEl = e.match(/<source\b[^>]*>[\s\S]*?<\/source>/i)?.[0];
    items.push({
      title,
      url: url.trim(),
      snippet: plainSnippet(html, 300),
      author: plainSnippet(tag(e, "dc:creator") ?? tag(tag(e, "author") ?? "", "name") ?? tag(e, "author"), 120),
      outlet: sourceEl ? plainSnippet(tag(sourceEl, "source"), 120) : null,
      publishedAt: iso(tag(e, "pubDate") ?? tag(e, "published") ?? tag(e, "updated") ?? tag(e, "dc:date")),
      imageUrl: videoId && /^[\w-]{11}$/.test(videoId) ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : imageOf(e, html),
    });
  }
  return { title: feedTitle ? plainSnippet(feedTitle, 120) : null, items };
}

type BskyPost = {
  post?: {
    uri?: string; indexedAt?: string; record?: { text?: string; createdAt?: string };
    author?: { handle?: string; displayName?: string };
    embed?: { images?: { thumb?: string }[]; external?: { uri?: string; title?: string; description?: string; thumb?: string } };
  };
  reason?: unknown; // reposts: se ignoran
};

/** Posts propios (sin respuestas ni reposts) de app.bsky.feed.getAuthorFeed. */
export function parseBluesky(json: unknown): { title: string | null; items: RawItem[] } {
  const feed = (json as { feed?: BskyPost[] })?.feed;
  if (!Array.isArray(feed)) return { title: null, items: [] };
  const items: RawItem[] = [];
  let title: string | null = null;
  for (const f of feed) {
    const p = f.post;
    if (!p || f.reason || !p.uri || !p.author?.handle) continue;
    const text = (p.record?.text ?? "").replace(/\s+/g, " ").trim();
    if (!text && !p.embed?.external) continue;
    const rkey = p.uri.split("/").pop();
    title ??= p.author.displayName || p.author.handle;
    const firstLine = text.split(/(?<=[.!?])\s/)[0] || p.embed?.external?.title || "";
    items.push({
      title: (firstLine.length > 180 ? `${firstLine.slice(0, 177)}…` : firstLine) || "Publicación en Bluesky",
      url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
      snippet: plainSnippet([text, p.embed?.external?.title, p.embed?.external?.description].filter(Boolean).join(" · "), 300),
      author: p.author.displayName || `@${p.author.handle}`,
      outlet: "Bluesky",
      publishedAt: iso(p.record?.createdAt ?? p.indexedAt ?? null),
      imageUrl: httpsImage(p.embed?.images?.[0]?.thumb ?? p.embed?.external?.thumb),
    });
  }
  return { title, items };
}

/** og:image / twitter:image declarados en el <head> de una página (para noticias sin imagen en el feed). */
export function ogImage(html: string): string | null {
  const head = html.slice(0, 200_000);
  for (const re of [/<meta\b[^>]*(?:property|name)="og:image(?::secure_url)?"[^>]*>/i, /<meta\b[^>]*(?:property|name)="twitter:image(?::src)?"[^>]*>/i]) {
    const m = head.match(re)?.[0];
    const c = m?.match(/\scontent="([^"]+)"/i)?.[1];
    if (c) return httpsImage(decodeEntities(c));
  }
  return null;
}

/** Enlace al feed declarado por una página (autodescubrimiento estándar: <link rel="alternate" type="application/rss+xml">). */
export function discoverFeed(html: string, base: string): string | null {
  const m = html.slice(0, 200_000).match(/<link\b[^>]*rel="alternate"[^>]*type="application\/(?:rss|atom)\+xml"[^>]*>|<link\b[^>]*type="application\/(?:rss|atom)\+xml"[^>]*rel="alternate"[^>]*>/i)?.[0];
  const href = m?.match(/\shref="([^"]+)"/i)?.[1];
  if (!href) return null;
  try { return new URL(decodeEntities(href), base).toString(); } catch { return null; }
}

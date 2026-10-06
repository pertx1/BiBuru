/** Cómo se convierte lo que escribe la persona en la dirección pública de cada fuente (sin claves ni APIs de pago). */
export type SourceKind = "rss" | "google_news" | "youtube" | "bluesky" | "mastodon" | "blog";

export const KIND_LABELS: Record<SourceKind, string> = {
  rss: "Periódico", google_news: "Google News", youtube: "YouTube", bluesky: "Bluesky", mastodon: "Mastodon", blog: "Newsletter / blog",
};
/** Redes sociales: más exigencia y «no contrastado» si ningún medio lo recoge. */
export const SOCIAL_KINDS = new Set<SourceKind>(["youtube", "bluesky", "mastodon"]);
/** Etiqueta que se muestra en cada noticia. */
export const itemLabel = (k: SourceKind) => (k === "rss" || k === "google_news" ? "Periódico" : KIND_LABELS[k]);

export type BuiltSource = { kind: SourceKind; url: string; handle: string; name: string } | { error: string };

export function googleNewsUrl(query: string, lang: "es" | "en"): string {
  const q = encodeURIComponent(`${query} when:1d`);
  return lang === "en" ? `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en` : `https://news.google.com/rss/search?q=${q}&hl=es&gl=ES&ceid=ES:es`;
}

/** A partir del tipo y de lo escrito (enlace, @cuenta, búsqueda…) devuelve la dirección del feed o un error en español. */
export function buildSource(kind: SourceKind, input: string, lang: "es" | "en" = "es"): BuiltSource {
  const v = input.trim();
  if (!v || v.length > 500) return { error: "Escribe algo (máx. 500 caracteres)." };
  switch (kind) {
    case "google_news":
      if (v.length < 2) return { error: "Escribe las palabras de búsqueda." };
      return { kind, url: googleNewsUrl(v, lang), handle: v, name: `Google News: ${v}`.slice(0, 100) };
    case "youtube": {
      const id = v.match(/(?:channel\/|channel_id=|^)(UC[\w-]{22})\b/)?.[1];
      if (!id) return { error: "Pega el enlace del canal con /channel/UC… o su ID (en el canal: Más información → Compartir canal → Copiar ID del canal)." };
      return { kind, url: `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, handle: id, name: "Canal de YouTube" };
    }
    case "bluesky": {
      const handle = v.replace(/^https?:\/\/bsky\.app\/profile\//i, "").replace(/^@/, "").split(/[/?#]/)[0].toLowerCase();
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(handle) && !/^did:plc:[a-z0-9]+$/.test(handle)) return { error: "Escribe la cuenta como @nombre.bsky.social o pega el enlace del perfil." };
      return { kind, url: `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&filter=posts_no_replies&limit=30`, handle: `@${handle}`, name: `@${handle}` };
    }
    case "mastodon": {
      let user: string | undefined, host: string | undefined;
      const m1 = v.match(/^@?([\w.]+)@([a-z0-9.-]+\.[a-z]{2,})$/i);
      const m2 = v.match(/^https:\/\/([a-z0-9.-]+\.[a-z]{2,})\/@([\w.]+)/i);
      if (m1) [user, host] = [m1[1], m1[2]]; else if (m2) [host, user] = [m2[1], m2[2]];
      if (!user || !host) return { error: "Escribe la cuenta como @usuario@servidor (p. ej. @ana@mastodon.social) o pega el enlace del perfil." };
      return { kind, url: `https://${host.toLowerCase()}/@${user}.rss`, handle: `@${user}@${host.toLowerCase()}`, name: `@${user}@${host.toLowerCase()}` };
    }
    case "rss":
    case "blog": {
      let u: URL;
      try { u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); } catch { return { error: "Pega un enlace válido." }; }
      if (u.protocol !== "https:") return { error: "Solo se admiten direcciones https://." };
      // Substack: el feed está siempre en /feed.
      if (/\.substack\.com$/i.test(u.hostname) && !/\/feed\/?$/.test(u.pathname)) u = new URL("/feed", u.origin);
      return { kind, url: u.toString(), handle: v, name: u.hostname.replace(/^www\./, "") };
    }
  }
}

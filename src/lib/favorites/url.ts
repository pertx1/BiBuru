/** Reconocimiento y normalización de enlaces de vídeo. Sin red: solo texto. */

export type VideoRef =
  | { source: "youtube"; externalId: string; url: string }
  | { source: "tiktok"; externalId: string | null; url: string; short: boolean }
  | { source: "other"; externalId: null; url: string };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"]);
const TT_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);
export const TT_SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"]);

/** Devuelve la URL como `URL` solo si es http(s) y está bien formada. */
export function parseHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

export function classifyVideoUrl(raw: string): VideoRef | null {
  const u = parseHttpUrl(raw);
  if (!u) return null;
  const host = u.hostname.toLowerCase();

  if (YT_HOSTS.has(host)) {
    let id: string | null = null;
    if (host.endsWith("youtu.be")) id = u.pathname.split("/")[1] ?? null;
    else if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(u.pathname);
      id = m?.[1] ?? null;
    }
    if (id && YT_ID.test(id)) return { source: "youtube", externalId: id, url: `https://www.youtube.com/watch?v=${id}` };
    return { source: "other", externalId: null, url: u.toString() };
  }

  if (TT_SHORT_HOSTS.has(host)) return { source: "tiktok", externalId: null, url: u.origin + u.pathname, short: true };
  if (TT_HOSTS.has(host)) {
    const m = /\/video\/(\d{6,25})/.exec(u.pathname);
    // Se conserva la ruta (@usuario/video/id) y se descartan los parámetros de seguimiento.
    return { source: "tiktok", externalId: m?.[1] ?? null, url: `https://www.tiktok.com${u.pathname.replace(/\/$/, "")}`, short: false };
  }
  return { source: "other", externalId: null, url: u.toString() };
}

/** Primer enlace http(s) de un texto libre. */
export function firstUrl(text: string): string | null {
  return /https?:\/\/[^\s<>"')]+/i.exec(text)?.[0].replace(/[.,;:!?]+$/, "") ?? null;
}

/** `PT1H2M3S` → segundos. Devuelve null si no es una duración válida (los directos llegan como `P0D`). */
export function parseIsoDuration(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return null;
  const [d, h, mi, s] = [m[1], m[2], m[3], m[4]].map((x) => Number(x ?? 0));
  const total = d * 86400 + h * 3600 + mi * 60 + s;
  return total > 0 ? total : null;
}

export function formatDuration(sec: number | null | undefined): string {
  if (!sec) return "";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

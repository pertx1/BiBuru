import { createHash } from "node:crypto";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—", laquo: "«", raquo: "»", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", euro: "€" };

/** Decodifica entidades HTML/XML y CDATA. */
export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
}

/** Texto plano corto a partir de HTML (entradillas): sin etiquetas, sin espacios repetidos, recortado por palabra. */
export function plainSnippet(html: string | null | undefined, max = 300): string | null {
  if (!html) return null;
  const text = decodeEntities(decodeEntities(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trim()}…`;
}

const TRACKING = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|ref_src$|igshid$|si$|_hsenc$|_hsmi$|cmpid$|ns_)/i;

/** URL canónica para comparar: sin parámetros de seguimiento, sin #, host en minúsculas, sin barra final. */
export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^(www\.|m\.|amp\.)/, "");
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    let s = u.toString();
    if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1);
    return s.replace(/\/amp$/, "");
  } catch {
    return null;
  }
}

export const urlHash = (normalized: string) => createHash("sha1").update(normalized).digest("hex");

const STOP = new Set("el la los las un una unos unas de del al a y o u en con por para sin sobre que se su sus es son como mas más ya lo le les ha han muy the a an of to in on for and or with by from at is are be as its it this that new".split(" "));

/** Clave del titular: minúsculas, sin acentos ni signos ni palabras vacías; palabras únicas ordenadas. */
export function titleKey(title: string): string {
  const words = decodeEntities(title).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s[-–—|·]\s[^-–—|·]{2,40}$/, "") // quita « - El Medio» al final (Google News)
    .replace(/[^a-z0-9ñ\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
  return [...new Set(words)].sort().join(" ").slice(0, 400);
}

/** Parecido entre dos claves de titular (Jaccard de palabras). */
export function titleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const A = new Set(a.split(" ")), B = new Set(b.split(" "));
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

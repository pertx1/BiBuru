/** Preselección sin IA (gratis): últimas 24 h, sin duplicados, sin lo ya publicado y sin temas descartados. */
import { SOCIAL_KINDS, type SourceKind } from "./sources";
import { titleSimilarity } from "./text";

export type ItemRow = {
  id: string; title: string; title_key: string; url: string; url_hash: string; snippet: string | null; outlet: string | null; author: string | null;
  source_kind: SourceKind; topic_id: string | null; image_url: string | null; published_at: string | null; fetched_at: string; feedback: string | null;
};
export type Candidate = ItemRow & { coverage: number; outlets: string[]; unverified: boolean; related: string[] };

export const SAME_STORY = 0.6;

/** Lo de política general, sucesos, deportes y cotilleo se descarta antes de gastar IA (sobre el titular normalizado). */
const BLOCK = /\b(futbol|liga|champions|laliga|gol|goles|baloncesto|nba|formula 1|f1|tenis|madrid cf|barca|asesin\w*|detenid\w*|crimen|homicidio|apuñal\w*|incendio|accidente|sucesos?|herid\w*|famos[oa]s?|boda|divorcio|corazon|horoscopo|loteria|sorteo|reality|gran hermano|pp|psoe|vox|sumar|podemos|feijoo|sanchez|ayuso|puigdemont|trump|biden|elecciones|parlamento|congreso|diputad\w*)\b/;

export function isBlocked(titleKey: string): boolean {
  return BLOCK.test(` ${titleKey} `);
}

/**
 * Agrupa la misma noticia publicada por varios medios o redes (mismo enlace o titular muy parecido) y deja una sola,
 * preferiblemente de un medio. `seenKeys`: titulares ya incluidos en resúmenes de otros días (se descartan).
 */
export function dedupe(items: ItemRow[], seenKeys: string[] = []): Candidate[] {
  const order = [...items].sort((a, b) => Number(SOCIAL_KINDS.has(a.source_kind)) - Number(SOCIAL_KINDS.has(b.source_kind)) || (a.published_at ?? a.fetched_at).localeCompare(b.published_at ?? b.fetched_at));
  const clusters: { lead: ItemRow; members: ItemRow[] }[] = [];
  for (const it of order) {
    if (it.feedback === "hidden") continue;
    if (seenKeys.some((k) => titleSimilarity(k, it.title_key) >= SAME_STORY)) continue;
    const c = clusters.find((x) => x.members.some((m) => m.url_hash === it.url_hash || titleSimilarity(m.title_key, it.title_key) >= SAME_STORY));
    if (c) c.members.push(it); else clusters.push({ lead: it, members: [it] });
  }
  return clusters.map(({ lead, members }) => {
    const outlets = [...new Set(members.map((m) => m.outlet ?? m.author ?? m.source_kind))];
    return {
      ...lead, image_url: lead.image_url ?? members.find((m) => m.image_url)?.image_url ?? null,
      coverage: outlets.length, outlets, related: members.slice(1).map((m) => m.id),
      // Lo de redes se marca «no contrastado» si ningún medio (no red social) cuenta lo mismo.
      unverified: SOCIAL_KINDS.has(lead.source_kind) && members.every((m) => SOCIAL_KINDS.has(m.source_kind)),
    };
  });
}

/** Solo lo publicado (o recogido, si el feed no trae fecha) en las últimas `hours` horas. */
export function recent(items: ItemRow[], now: Date, hours = 24): ItemRow[] {
  const min = now.getTime() - hours * 3600_000;
  return items.filter((i) => Date.parse(i.published_at ?? i.fetched_at) >= min && Date.parse(i.published_at ?? i.fetched_at) <= now.getTime() + 3600_000);
}

export type TopicLite = { id: string; name: string; keywords: string[] };

/** Tema por palabras clave si la fuente no lo trae. */
export function guessTopic(text: string, topics: TopicLite[]): string | null {
  const t = ` ${text.toLowerCase()} `;
  let best: { id: string; n: number } | null = null;
  for (const tp of topics) {
    const n = tp.keywords.filter((k) => k && t.includes(k.toLowerCase())).length;
    if (n > 0 && (!best || n > best.n)) best = { id: tp.id, n };
  }
  return best?.id ?? null;
}

/** Hasta `limit` candidatos repartidos entre temas (los más cubiertos y recientes primero), para una sola llamada a la IA. */
export function pickCandidates(cands: Candidate[], limit = 80): Candidate[] {
  const kept = cands.filter((c) => !isBlocked(c.title_key));
  const rank = (a: Candidate, b: Candidate) => Number(a.unverified) - Number(b.unverified) || b.coverage - a.coverage || (b.published_at ?? b.fetched_at).localeCompare(a.published_at ?? a.fetched_at);
  const byTopic = new Map<string, Candidate[]>();
  for (const c of kept) (byTopic.get(c.topic_id ?? "none") ?? byTopic.set(c.topic_id ?? "none", []).get(c.topic_id ?? "none")!).push(c);
  for (const l of byTopic.values()) l.sort(rank);
  const out: Candidate[] = [];
  while (out.length < limit && [...byTopic.values()].some((l) => l.length)) for (const l of byTopic.values()) { const c = l.shift(); if (c && out.length < limit) out.push(c); }
  return out;
}

/** Resumen diario: esquema de la respuesta de la IA, instrucciones y composición (con o sin IA). Todo puro y probado. */
import { z } from "zod";
import { itemLabel, type SourceKind } from "./sources";
import type { Candidate } from "./select";

export const MIN_SCORE = 3;
export const MAX_ITEMS = 10;

export const aiDigestSchema = z.object({
  top: z.array(z.string().min(3).max(300)).min(1).max(3),
  items: z.array(z.object({
    id: z.string().max(10),
    score: z.number().int().min(1).max(5),
    summary: z.string().min(3).max(400),
    action: z.string().min(3).max(240),
    business: z.string().max(80).nullable(),
  })).max(80),
  idea: z.object({ text: z.string().min(3).max(300), why: z.string().max(300) }).nullable(),
});
export type AiDigest = z.infer<typeof aiDigestSchema>;

export const aiDigestJsonSchema = {
  type: "object",
  properties: {
    top: { type: "array", items: { type: "string" }, maxItems: 3 },
    items: { type: "array", items: { type: "object", properties: {
      id: { type: "string" }, score: { type: "integer", minimum: 1, maximum: 5 }, summary: { type: "string" }, action: { type: "string" }, business: { type: "string", nullable: true },
    }, required: ["id", "score", "summary", "action", "business"] } },
    idea: { type: "object", nullable: true, properties: { text: { type: "string" }, why: { type: "string" } }, required: ["text", "why"] },
  },
  required: ["top", "items", "idea"],
};

export type TopicView = { id: string; name: string; color: string; icon: string };
export type DigestItem = {
  itemId: string; title: string; url: string; outlet: string | null; author: string | null; kind: SourceKind; label: string;
  imageUrl: string | null; topic: TopicView | null; score: number | null; summary: string | null; action: string | null;
  business: string | null; unverified: boolean; coverage: number;
};
export type DigestContent = {
  top: string[];
  items: DigestItem[];
  idea: { text: string; why: string } | null;
  closest: DigestItem[];      // si ninguna pasa el filtro: las 3 más cercanas
  candidates: number;
  note: string | null;        // p. ej. «Sin presupuesto de IA: titulares sin resumen»
};
export type DigestStatus = "ai" | "fallback" | "empty";

export function buildSystemPrompt(): string {
  return [
    "Eres el editor de noticias de BiBuru para un emprendedor en España. Filtra con UNA pregunta: «¿esto le sirve para ganar más dinero o escalar sus negocios?».",
    "Puntúa cada candidata del 1 al 5 según su utilidad para SUS negocios (te los describo). Prioriza: oportunidades concretas, cambios en plataformas donde vende o crea contenido,",
    "herramientas que ahorran tiempo o dinero, cambios legales o fiscales que le afectan en España, tendencias de consumo y casos de éxito con datos.",
    "Puntúa 1 la política general, sucesos, deportes, cotilleo, opinión sin datos, titulares sensacionalistas y notas de prensa sin contenido.",
    "Con las de redes sociales (YouTube, Bluesky, Mastodon) sé más exigente: solo información concreta, nunca opiniones sueltas ni autopromoción.",
    "Reglas: escribe en español de España con tus propias palabras; usa SOLO lo que dice el titular y la entradilla; no inventes datos ni cifras;",
    "en «summary» (1–2 frases) cuenta el hecho; en «action» (una línea, empieza por un verbo) tu sugerencia práctica, separada del hecho;",
    "«business» es el nombre exacto de uno de sus negocios al que aplica, o null. «top»: 3 puntos con lo más importante de hoy.",
    "«idea»: UNA acción para ganar más o escalar basada en las noticias de hoy (o null si no hay base). Devuelve solo el JSON pedido, con el «id» de cada candidata.",
  ].join(" ");
}

/** Lo que recibe el modelo: negocios, temas, preferencias aprendidas y candidatas (titular y entradilla, nunca el artículo). */
export function buildUserPrompt(o: { businesses: { name: string; description: string | null }[]; topicName: (id: string | null) => string; liked: string[]; hidden: string[]; candidates: Candidate[] }): string {
  const lines = [
    "NEGOCIOS:", ...o.businesses.map((b) => `- ${b.name}${b.description ? `: ${b.description.slice(0, 200)}` : ""}`),
    o.liked.length ? `LE RESULTARON ÚTILES (ejemplos): ${o.liked.slice(0, 10).join(" | ")}` : "",
    o.hidden.length ? `NO LE INTERESAN (ejemplos): ${o.hidden.slice(0, 10).join(" | ")}` : "",
    "CANDIDATAS (id | tipo | medio | tema | titular | entradilla):",
    ...o.candidates.map((c, i) => [`n${i + 1}`, itemLabel(c.source_kind) + (c.unverified ? " (no contrastado)" : ""), c.outlet ?? c.author ?? "", o.topicName(c.topic_id), c.title, (c.snippet ?? "").slice(0, 220)].join(" | ")),
  ];
  return lines.filter(Boolean).join("\n");
}

const toItem = (c: Candidate, topic: TopicView | null, extra: Partial<DigestItem> = {}): DigestItem => ({
  itemId: c.id, title: c.title, url: c.url, outlet: c.outlet, author: c.author, kind: c.source_kind, label: itemLabel(c.source_kind),
  imageUrl: c.image_url, topic, score: null, summary: null, action: null, business: null, unverified: c.unverified, coverage: c.coverage, ...extra,
});

/**
 * Compone el resumen. Con respuesta de IA: solo las de nota ≥ 3, como mucho 10, de más a menos útiles; si ninguna pasa,
 * estado «empty» con las 3 más cercanas. Sin IA (sin presupuesto o error): titulares con foto agrupados por tema.
 */
export function composeDigest(o: { candidates: Candidate[]; ai: AiDigest | null; topics: TopicView[]; businessNames: string[]; fallbackNote?: string }): { status: DigestStatus; content: DigestContent } {
  const topicOf = (id: string | null) => o.topics.find((t) => t.id === id) ?? null;
  const base = { candidates: o.candidates.length, closest: [] as DigestItem[], note: null as string | null };
  if (!o.ai) {
    const order = new Map(o.topics.map((t, i) => [t.id, i]));
    const items = [...o.candidates].sort((a, b) => (order.get(a.topic_id ?? "") ?? 99) - (order.get(b.topic_id ?? "") ?? 99) || b.coverage - a.coverage).slice(0, MAX_ITEMS)
      .map((c) => toItem(c, topicOf(c.topic_id)));
    return { status: "fallback", content: { ...base, top: [], items, idea: null, note: o.fallbackNote ?? "Hoy sin resumen de la IA: estos son los titulares con más eco." } };
  }
  const byId = new Map(o.candidates.map((c, i) => [`n${i + 1}`, c]));
  const scored = o.ai.items.flatMap((r) => {
    const c = byId.get(r.id);
    if (!c) return []; // la IA no puede colar noticias que no estaban
    const business = r.business && o.businessNames.find((n) => n.toLowerCase() === r.business!.toLowerCase());
    return [toItem(c, topicOf(c.topic_id), { score: r.score, summary: r.summary, action: r.action, business: business ?? null })];
  });
  const seen = new Set<string>();
  const unique = scored.filter((s) => (seen.has(s.itemId) ? false : (seen.add(s.itemId), true)))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || Number(a.unverified) - Number(b.unverified) || b.coverage - a.coverage);
  const items = unique.filter((s) => (s.score ?? 0) >= MIN_SCORE).slice(0, MAX_ITEMS);
  if (items.length === 0) return { status: "empty", content: { ...base, top: o.ai.top, items: [], idea: null, closest: unique.slice(0, 3) } };
  return { status: "ai", content: { ...base, top: o.ai.top.slice(0, 3), items, idea: o.ai.idea } };
}

/** Texto de la notificación: titular principal y cuántas hay (o aviso corto si no pasó ninguna). */
export function notificationText(status: DigestStatus, content: DigestContent): { title: string; body: string; image: string | null } {
  const lead = content.items[0] ?? content.closest[0];
  if (!lead) return { title: "Tus noticias de hoy", body: "Hoy no hay noticias nuevas en tus fuentes.", image: null };
  if (status === "empty") return { title: "Tus noticias de hoy", body: `Nada importante hoy. Lo más cercano: ${lead.title}`, image: lead.imageUrl };
  const n = content.items.length;
  return { title: "Tus noticias de hoy", body: `${lead.title}${n > 1 ? ` · y ${n - 1} ${n - 1 === 1 ? "más" : "más"}` : ""}`, image: lead.imageUrl };
}

import "server-only";
import { geminiProvider, getModelNames, hasGeminiKey } from "@/lib/ai/gemini";
import { AiBlockedError, runAi, type AiContext } from "@/lib/ai/run";
import { addDays, nowLocal } from "@/lib/dates";
import { FetchError, safeFetchText } from "@/lib/net/safe-fetch";
import type { AdminClient } from "@/lib/supabase/admin";
import { aiDigestJsonSchema, aiDigestSchema, buildSystemPrompt, buildUserPrompt, composeDigest, type AiDigest, type DigestContent, type DigestStatus, type TopicView } from "./digest";
import { discoverFeed, ogImage, parseBluesky, parseFeed, type RawItem } from "./feeds";
import { PRESET_SOURCES, PRESET_TOPICS } from "./presets";
import { dedupe, guessTopic, pickCandidates, recent, type ItemRow } from "./select";
import type { SourceKind } from "./sources";
import { normalizeUrl, titleKey, urlHash } from "./text";

type Db = AdminClient; // también vale el cliente con sesión (mismas tablas, con RLS)
export type SourceRow = { id: string; workspace_id: string; user_id: string; kind: SourceKind; name: string; url: string; topic_id: string | null; active: boolean; fail_count: number };

/** Crea los temas y medios iniciales del espacio si aún no tiene temas (idempotente). */
export async function ensureNewsSetup(db: Db, workspaceId: string, userId: string): Promise<void> {
  const { count } = await db.from("news_topics").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
  if ((count ?? 0) > 0) return;
  const { data: topics } = await db.from("news_topics").upsert(
    PRESET_TOPICS.map((t, i) => ({ workspace_id: workspaceId, user_id: userId, name: t.name, description: t.description, keywords: [...t.keywords], color: t.color, icon: t.icon, sort_order: i })),
    { onConflict: "workspace_id,name", ignoreDuplicates: true },
  ).select("id, name");
  const idOf = (key: string) => topics?.find((t) => t.name === PRESET_TOPICS.find((p) => p.key === key)?.name)?.id ?? null;
  await db.from("news_sources").upsert(
    PRESET_SOURCES.map((s) => ({ workspace_id: workspaceId, user_id: userId, kind: s.kind, name: s.name, url: s.url, lang: s.lang, topic_id: idOf(s.topic), preset: true })),
    { onConflict: "workspace_id,url", ignoreDuplicates: true },
  );
}

/** Descarga y lee una fuente. Si es una página web (blog sin feed directo), busca su feed declarado. */
export async function readSource(kind: SourceKind, url: string, o: { discover?: boolean; timeoutMs?: number } = {}): Promise<{ feedUrl: string; title: string | null; items: RawItem[] }> {
  const res = await safeFetchText(url, { timeoutMs: o.timeoutMs ?? 6000 });
  if (kind === "bluesky") {
    let json: unknown;
    try { json = JSON.parse(res.text); } catch { throw new FetchError("Respuesta no válida de Bluesky"); }
    return { feedUrl: url, ...parseBluesky(json) };
  }
  if (/<(rss|feed|rdf:RDF)[\s>]/i.test(res.text.slice(0, 5000))) return { feedUrl: res.finalUrl, ...parseFeed(res.text) };
  if (o.discover) {
    const feed = discoverFeed(res.text, res.finalUrl);
    if (feed) return readSource(kind, feed, { timeoutMs: o.timeoutMs });
  }
  throw new FetchError("No es un feed RSS/Atom (ni la página declara uno)");
}

const SOCIAL: SourceKind[] = ["youtube", "bluesky", "mastodon"];

/** Recoge una fuente: guarda solo titular, entradilla, enlace, medio, fecha e imagen. Si falla, la marca y sigue. */
export async function collectSource(db: Db, s: SourceRow, topics: { id: string; name: string; keywords: string[] }[], now = new Date()): Promise<{ added: number; error?: string }> {
  try {
    const { items } = await readSource(s.kind, s.url);
    const rows = items.slice(0, 60).flatMap((it) => {
      const norm = normalizeUrl(it.url);
      if (!norm) return [];
      const text = `${it.title} ${it.snippet ?? ""}`;
      return [{
        workspace_id: s.workspace_id, user_id: s.user_id, source_id: s.id, source_kind: s.kind, url: it.url.slice(0, 2000), url_hash: urlHash(norm),
        title: it.title.slice(0, 400), title_key: titleKey(it.title), snippet: it.snippet?.slice(0, 600) ?? null,
        outlet: (it.outlet ?? (SOCIAL.includes(s.kind) ? null : s.name))?.slice(0, 120) ?? null, author: it.author?.slice(0, 120) ?? (SOCIAL.includes(s.kind) ? s.name.slice(0, 120) : null),
        image_url: it.imageUrl, published_at: it.publishedAt, topic_id: s.topic_id ?? guessTopic(text, topics),
      }];
    });
    let added = 0;
    if (rows.length) {
      const { data, error } = await db.from("news_items").upsert(rows, { onConflict: "workspace_id,url_hash", ignoreDuplicates: true }).select("id");
      if (error) throw new Error(error.message);
      added = data?.length ?? 0;
    }
    await db.from("news_sources").update({ status: "ok", last_error: null, fail_count: 0, last_checked_at: now.toISOString(), last_fetched_at: now.toISOString() }).eq("id", s.id);
    return { added };
  } catch (e) {
    const error = (e instanceof FetchError ? e.message : "No se pudo leer").slice(0, 300);
    if (!(e instanceof FetchError)) console.error("[news] fuente", s.name, e instanceof Error ? e.message : e);
    await db.from("news_sources").update({ status: "down", last_error: error, fail_count: s.fail_count + 1, last_checked_at: now.toISOString(), last_fetched_at: now.toISOString() }).eq("id", s.id);
    return { added: 0, error };
  }
}

/** Recoge las fuentes activas que llevan más de `staleMinutes` sin leerse (pocas por vez para no pasar del tiempo de Vercel). */
export async function collectDue(db: Db, o: { workspaceId?: string; staleMinutes?: number; limit?: number; now?: Date } = {}) {
  const now = o.now ?? new Date();
  const cutoff = new Date(now.getTime() - (o.staleMinutes ?? 60) * 60_000).toISOString();
  let q = db.from("news_sources").select("id, workspace_id, user_id, kind, name, url, topic_id, active, fail_count").eq("active", true)
    .or(`last_fetched_at.is.null,last_fetched_at.lt.${cutoff}`).order("last_fetched_at", { ascending: true, nullsFirst: true }).limit(o.limit ?? 12);
  if (o.workspaceId) q = q.eq("workspace_id", o.workspaceId);
  const { data: sources } = await q;
  if (!sources?.length) return { sources: 0, added: 0, failed: 0 };
  const wsIds = [...new Set(sources.map((s) => s.workspace_id))];
  const { data: topics } = await db.from("news_topics").select("id, workspace_id, name, keywords").in("workspace_id", wsIds).eq("active", true);
  let added = 0, failed = 0;
  // De 6 en 6 en paralelo: con 6 s máximo por fuente, 12 fuentes ≈ 12 s.
  for (let i = 0; i < sources.length; i += 6) {
    const res = await Promise.all(sources.slice(i, i + 6).map((s) => collectSource(db, s as SourceRow, (topics ?? []).filter((t) => t.workspace_id === s.workspace_id), now)));
    for (const r of res) { added += r.added; if (r.error) failed++; }
  }
  return { sources: sources.length, added, failed };
}

/** Comprueba una fuente nueva antes de darla de alta: debe responder y traer al menos una entrada. */
export async function validateSource(kind: SourceKind, url: string): Promise<{ ok: true; feedUrl: string; title: string | null; count: number } | { ok: false; error: string }> {
  try {
    const r = await readSource(kind, url, { discover: kind === "rss" || kind === "blog", timeoutMs: 8000 });
    if (r.items.length === 0) return { ok: false, error: "La fuente responde pero no trae ninguna entrada." };
    return { ok: true, feedUrl: r.feedUrl, title: r.title, count: r.items.length };
  } catch (e) {
    return { ok: false, error: e instanceof FetchError ? e.message : "No se pudo comprobar la fuente." };
  }
}

/** Portada declarada por la página (og:image) para las elegidas sin imagen. No para Google News (sus enlaces son de Google). */
async function fillImages(db: Db, content: DigestContent) {
  const missing = content.items.filter((i) => !i.imageUrl && i.kind !== "google_news" && !/news\.google\.com/.test(i.url)).slice(0, 10);
  await Promise.all(missing.map(async (i) => {
    try {
      const page = await safeFetchText(i.url, { timeoutMs: 4000, maxBytes: 400_000, accept: "text/html" });
      const img = ogImage(page.text);
      if (img) { i.imageUrl = img; await db.from("news_items").update({ image_url: img }).eq("id", i.itemId); }
    } catch { /* sin foto: se muestra el recuadro del tema */ }
  }));
}

export type GenerateResult = { status: DigestStatus | "exists" | "busy" | "limit"; items?: number; error?: string };

/**
 * Genera el resumen del día de una persona. Idempotente: reclama la fila del día antes de llamar a la IA, así dos
 * ejecuciones del cron no pagan dos veces. `manual`: botón «Generar ahora» (máx. 2 al día, rehace el del día).
 */
export async function generateDigest(db: Db, who: { userId: string; workspaceId: string; timezone: string; budgetCents: number }, o: { manual?: boolean; now?: Date } = {}): Promise<GenerateResult> {
  const now = o.now ?? new Date();
  const day = nowLocal(now, who.timezone).date;
  const key = { user_id: who.userId, workspace_id: who.workspaceId, day };
  const { data: existing } = await db.from("news_digests").select("id, manual_runs, content, updated_at").match(key).maybeSingle();
  if (existing) {
    const pending = (existing.content as { pending?: boolean }).pending === true;
    const stuck = pending && now.getTime() - Date.parse(existing.updated_at) > 10 * 60_000;
    if (!o.manual && !stuck) return { status: pending ? "busy" : "exists" };
    if (o.manual) {
      if (existing.manual_runs >= 2) return { status: "limit", error: "Ya has generado el resumen 2 veces hoy." };
      const { data: claimed } = await db.from("news_digests").update({ manual_runs: existing.manual_runs + 1, content: { ...(existing.content as object), pending: true } as never })
        .eq("id", existing.id).eq("manual_runs", existing.manual_runs).select("id");
      if (!claimed?.length) return { status: "busy" };
    }
  } else {
    const { data: claimed } = await db.from("news_digests").upsert({ ...key, status: "empty", content: { pending: true } as never, manual_runs: o.manual ? 1 : 0 }, { onConflict: "user_id,workspace_id,day", ignoreDuplicates: true }).select("id");
    if (!claimed?.length) return { status: "busy" };
  }

  // Candidatas: últimas 24 h, sin las ya publicadas otros días ni las marcadas «No me interesa».
  const since = new Date(now.getTime() - 36 * 3600_000).toISOString();
  const [items, seen, fb, topicsQ, bizQ] = await Promise.all([
    db.from("news_items").select("id, title, title_key, url, url_hash, snippet, outlet, author, source_kind, topic_id, image_url, published_at, fetched_at, feedback, digest_day")
      .eq("workspace_id", who.workspaceId).gte("fetched_at", since).order("fetched_at", { ascending: false }).limit(1500),
    db.from("news_items").select("title_key").eq("workspace_id", who.workspaceId).not("digest_day", "is", null).neq("digest_day", day).gte("digest_day", addDays(day, -14)).limit(500),
    db.from("news_items").select("title, feedback").eq("workspace_id", who.workspaceId).not("feedback", "is", null).order("updated_at", { ascending: false }).limit(40),
    db.from("news_topics").select("id, name, color, icon, keywords, sort_order").eq("workspace_id", who.workspaceId).eq("active", true).order("sort_order"),
    db.from("businesses").select("name, description").eq("workspace_id", who.workspaceId).eq("archived", false),
  ]);
  const pool = recent(((items.data ?? []) as (ItemRow & { digest_day: string | null })[]).filter((i) => !i.digest_day || i.digest_day === day), now);
  const activeTopicIds = new Set((topicsQ.data ?? []).map((t) => t.id));
  const candidates = pickCandidates(dedupe(pool.filter((i) => !i.topic_id || activeTopicIds.has(i.topic_id)), (seen.data ?? []).map((s) => s.title_key)));
  const topics: TopicView[] = (topicsQ.data ?? []).map((t) => ({ id: t.id, name: t.name, color: t.color, icon: t.icon }));
  const businesses = bizQ.data ?? [];

  let ai: AiDigest | null = null, note: string | undefined, cost = 0;
  if (candidates.length > 0) {
    if (!hasGeminiKey()) note = "La IA no está configurada: titulares sin resumen.";
    else {
      try {
        const ctx: AiContext = { supabase: db, workspaceId: who.workspaceId, userId: who.userId, timezone: who.timezone, budgetCents: who.budgetCents, provider: geminiProvider(), models: getModelNames() };
        const res = await runAi(ctx, "news", {
          model: ctx.models.fast, system: buildSystemPrompt(), jsonSchema: aiDigestJsonSchema, temperature: 0.2, maxOutputTokens: 3000,
          contents: [{ role: "user", parts: [{ text: buildUserPrompt({
            businesses, topicName: (id) => topics.find((t) => t.id === id)?.name ?? "—", candidates,
            liked: (fb.data ?? []).filter((f) => f.feedback === "useful").map((f) => f.title), hidden: (fb.data ?? []).filter((f) => f.feedback === "hidden").map((f) => f.title),
          }) }] }],
        });
        cost = res.costMicros;
        const parsed = aiDigestSchema.safeParse(JSON.parse(res.text));
        if (parsed.success) ai = parsed.data; else note = "La IA devolvió un formato no válido: titulares sin resumen.";
      } catch (e) {
        note = e instanceof AiBlockedError ? "Sin presupuesto de IA este mes: titulares sin resumen." : "La IA no respondió: titulares sin resumen.";
        if (!(e instanceof AiBlockedError)) console.error("[news] IA:", e instanceof Error ? e.message : e);
      }
    }
  }
  const { status, content } = composeDigest({ candidates, ai, topics, businessNames: businesses.map((b) => b.name), fallbackNote: note });
  await fillImages(db, content);
  // Las publicadas (y sus duplicados) no se repiten otros días.
  const used = content.items.map((i) => i.itemId);
  const related = candidates.filter((c) => used.includes(c.id)).flatMap((c) => c.related);
  if (used.length) await db.from("news_items").update({ digest_day: day }).in("id", [...used, ...related]);
  for (const i of content.items) if (i.score) await db.from("news_items").update({ score: i.score }).eq("id", i.itemId);
  await db.from("news_digests").update({ status, content: content as never, cost_micros: cost }).match(key);
  return { status, items: content.items.length };
}

type NewsProfile = { user_id: string; default_workspace_id: string | null; timezone: string; ai_monthly_budget_cents: number; news_enabled: boolean; news_time: string; news_weekends: boolean };

/** ¿Toca generar? Desde 20 min antes de su hora (para que esté listo a la hora), hoy, y en fin de semana solo si lo quiere. */
export function newsDue(p: Pick<NewsProfile, "news_enabled" | "news_time" | "news_weekends">, local: { date: string; time: string }): boolean {
  if (!p.news_enabled) return false;
  const dow = (new Date(`${local.date}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = lunes
  if (!p.news_weekends && dow >= 5) return false;
  const [h, m] = p.news_time.slice(0, 5).split(":").map(Number);
  const [nh, nm] = local.time.slice(0, 5).split(":").map(Number);
  return nh * 60 + nm >= h * 60 + m - 20;
}

/** Cron de noticias (cada 15 min): recoge fuentes pendientes y genera el resumen de quien le toque. */
export async function runNewsCron(db: Db, now = new Date()) {
  const { data: profiles } = await db.from("profiles").select("user_id, default_workspace_id, timezone, ai_monthly_budget_cents, news_enabled, news_time, news_weekends").eq("news_enabled", true).limit(50);
  const out = { users: 0, generated: 0, collected: 0 };
  for (const p of (profiles ?? []) as NewsProfile[]) {
    if (!p.default_workspace_id) continue;
    await ensureNewsSetup(db, p.default_workspace_id, p.user_id);
  }
  out.collected = (await collectDue(db, { now, limit: 12 })).added;
  for (const p of (profiles ?? []) as NewsProfile[]) {
    if (!p.default_workspace_id || !newsDue(p, nowLocal(now, p.timezone))) continue;
    out.users++;
    const r = await generateDigest(db, { userId: p.user_id, workspaceId: p.default_workspace_id, timezone: p.timezone, budgetCents: p.ai_monthly_budget_cents }, { now });
    if (r.status === "ai" || r.status === "fallback" || r.status === "empty") out.generated++;
    if (out.generated >= 2) break; // margen de tiempo de Vercel: el resto en la siguiente pasada
  }
  return out;
}

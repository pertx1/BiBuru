import { describe, expect, it } from "vitest";
import { composeDigest, notificationText, type AiDigest, type TopicView } from "./digest";
import { discoverFeed, ogImage, parseBluesky, parseFeed } from "./feeds";
import { dedupe, guessTopic, isBlocked, pickCandidates, recent, type ItemRow } from "./select";
import { buildSource } from "./sources";
import { normalizeUrl, plainSnippet, titleKey, titleSimilarity, urlHash } from "./text";
import { planNewsPush, type Prefs } from "../notifications/planning";

const row = (o: Partial<ItemRow> & { id: string; title: string }): ItemRow => ({
  title_key: titleKey(o.title), url: `https://medio.es/${o.id}`, url_hash: urlHash(`https://medio.es/${o.id}`), snippet: null, outlet: "Medio", author: null,
  source_kind: "rss", topic_id: null, image_url: null, published_at: "2026-10-06T06:00:00.000Z", fetched_at: "2026-10-06T06:30:00.000Z", feedback: null, ...o,
});

describe("textos y enlaces", () => {
  it("quita el seguimiento y normaliza el enlace", () => {
    expect(normalizeUrl("https://www.Expansion.com/empresas/nota.html?utm_source=tw&utm_medium=x&id=3#comentarios")).toBe("https://expansion.com/empresas/nota.html?id=3");
    expect(normalizeUrl("https://m.xataka.com/a/b/?fbclid=1")).toBe("https://xataka.com/a/b");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
  });
  it("misma noticia con titulares parecidos (y sin « - Medio» de Google News)", () => {
    const a = titleKey("Hacienda sube la cuota de autónomos en 2027 - Cinco Días");
    const b = titleKey("Hacienda sube la cuota de los autónomos para 2027");
    expect(titleSimilarity(a, b)).toBeGreaterThanOrEqual(0.6);
    expect(titleSimilarity(a, titleKey("Shopify lanza un asistente de IA para tiendas"))).toBeLessThan(0.2);
  });
  it("entradilla en texto plano y recortada", () => {
    expect(plainSnippet("<p>Hola &amp; <b>adiós</b></p>")).toBe("Hola & adiós");
    expect(plainSnippet("palabra ".repeat(100), 50)!.length).toBeLessThanOrEqual(51);
  });
});

describe("lectura de feeds", () => {
  it("RSS con media:content y Google News con su medio real", () => {
    const xml = `<rss><channel><title>Cinco Días</title>
      <item><title><![CDATA[Las ventas online de moda crecen un 12 %]]></title><link>https://cincodias.elpais.com/a.html</link><description>&lt;p&gt;El sector textil...&lt;/p&gt;</description><pubDate>Tue, 06 Oct 2026 06:00:00 GMT</pubDate><media:content url="https://img.elpais.com/a.jpg" medium="image"/></item>
      <item><title>Ayudas para autónomos - Expansión</title><link>https://news.google.com/rss/articles/abc</link><source url="https://expansion.com">Expansión</source></item>
      <item><title>Sin enlace</title></item></channel></rss>`;
    const f = parseFeed(xml);
    expect(f.title).toBe("Cinco Días");
    expect(f.items).toHaveLength(2);
    expect(f.items[0]).toMatchObject({ title: "Las ventas online de moda crecen un 12 %", snippet: "El sector textil...", imageUrl: "https://img.elpais.com/a.jpg", publishedAt: "2026-10-06T06:00:00.000Z" });
    expect(f.items[1]).toMatchObject({ outlet: "Expansión", imageUrl: null }); // noticia sin imagen: null (se pinta el recuadro del tema)
  });
  it("YouTube (Atom) usa la miniatura del vídeo", () => {
    const xml = `<feed xmlns:yt="x"><title>Canal</title><entry><yt:videoId>dQw4w9WgXcQ</yt:videoId><title>Cómo vender más</title><link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/><published>2026-10-06T05:00:00+00:00</published><author><name>Canal</name></author></entry></feed>`;
    expect(parseFeed(xml).items[0]).toMatchObject({ imageUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", author: "Canal", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
  });
  it("Bluesky: posts propios, sin reposts, con su enlace público", () => {
    const f = parseBluesky({ feed: [
      { post: { uri: "at://did:plc:x/app.bsky.feed.post/3kabc", author: { handle: "ana.bsky.social", displayName: "Ana" }, record: { text: "Meta cambia las comisiones de Instagram Shopping. Detalles dentro.", createdAt: "2026-10-06T07:00:00Z" } } },
      { reason: { $type: "repost" }, post: { uri: "at://x/app.bsky.feed.post/zzz", author: { handle: "otro.bsky.social" }, record: { text: "repost" } } },
    ] });
    expect(f.items).toHaveLength(1);
    expect(f.items[0]).toMatchObject({ url: "https://bsky.app/profile/ana.bsky.social/post/3kabc", author: "Ana", outlet: "Bluesky", imageUrl: null });
  });
  it("portada og:image y feed declarado por la página", () => {
    expect(ogImage(`<head><meta property="og:image" content="https://medio.es/foto.jpg"></head>`)).toBe("https://medio.es/foto.jpg");
    expect(ogImage(`<head><meta property="og:image" content="javascript:x"></head>`)).toBeNull();
    expect(discoverFeed(`<link rel="alternate" type="application/rss+xml" href="/feed">`, "https://blog.es/post")).toBe("https://blog.es/feed");
  });
});

describe("fuentes", () => {
  it("convierte lo escrito en el feed público de cada red", () => {
    expect(buildSource("bluesky", "https://bsky.app/profile/Ana.bsky.social")).toMatchObject({ url: expect.stringContaining("public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=ana.bsky.social") });
    expect(buildSource("mastodon", "@ana@mastodon.social")).toMatchObject({ url: "https://mastodon.social/@ana.rss" });
    expect(buildSource("youtube", "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv")).toMatchObject({ url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv" });
    expect(buildSource("blog", "midiario.substack.com")).toMatchObject({ url: "https://midiario.substack.com/feed" });
    expect(buildSource("google_news", "ayudas autónomos")).toMatchObject({ url: expect.stringContaining("news.google.com/rss/search?q=ayudas%20aut%C3%B3nomos%20when%3A1d&hl=es") });
    expect(buildSource("youtube", "@canal")).toHaveProperty("error");
    expect(buildSource("rss", "http://inseguro.es/rss")).toHaveProperty("error");
  });
});

describe("selección sin IA", () => {
  it("elimina duplicados entre medios y redes, y prefiere el medio", () => {
    const c = dedupe([
      row({ id: "1", title: "Bluesky: Hacienda sube la cuota de autónomos en 2027", source_kind: "bluesky", outlet: "Bluesky", published_at: "2026-10-06T05:00:00.000Z" }),
      row({ id: "2", title: "Hacienda sube la cuota de autónomos en 2027", outlet: "Expansión" }),
      row({ id: "3", title: "Hacienda sube la cuota de los autónomos para 2027 - Cinco Días", outlet: "Cinco Días", url_hash: urlHash("x3") }),
      row({ id: "4", title: "Shopify lanza un asistente de IA", outlet: "Xataka" }),
    ]);
    expect(c).toHaveLength(2);
    const story = c.find((x) => x.related.length)!;
    expect(story.source_kind).toBe("rss");
    expect(story.coverage).toBe(3);
    expect(story.unverified).toBe(false);
  });
  it("lo de redes que ningún medio recoge queda «no contrastado»", () => {
    expect(dedupe([row({ id: "9", title: "Rumor sobre comisiones de TikTok Shop", source_kind: "mastodon" })])[0].unverified).toBe(true);
  });
  it("descarta lo ya publicado otros días y lo marcado «No me interesa»", () => {
    const c = dedupe([row({ id: "1", title: "Amazon cambia las tarifas de FBA" }), row({ id: "2", title: "Nueva ayuda digital", feedback: "hidden" })], [titleKey("Amazon cambia sus tarifas de FBA")]);
    expect(c).toHaveLength(0);
  });
  it("solo últimas 24 h, sin deportes ni sucesos, y temas repartidos", () => {
    const now = new Date("2026-10-06T08:00:00Z");
    expect(recent([row({ id: "a", title: "x", published_at: "2026-10-04T08:00:00Z" }), row({ id: "b", title: "y" })], now).map((r) => r.id)).toEqual(["b"]);
    expect(isBlocked(titleKey("El Barça gana la Champions"))).toBe(true);
    expect(isBlocked(titleKey("Bajan las comisiones de Vinted para vendedores"))).toBe(false);
    const many = dedupe([...Array.from({ length: 6 }, (_, i) => row({ id: `a${i}`, title: `Tema A noticia distinta ${i} alfa${i}`, topic_id: "A" })), row({ id: "b1", title: "Tema B única beta", topic_id: "B" })]);
    expect(pickCandidates(many, 2).map((c) => c.topic_id).sort()).toEqual(["A", "B"]);
    expect(guessTopic("Instagram cambia el algoritmo de reels", [{ id: "m", name: "Marketing", keywords: ["instagram", "reels"] }, { id: "e", name: "Eco", keywords: ["ipc"] }])).toBe("m");
  });
});

describe("resumen del día", () => {
  const topics: TopicView[] = [{ id: "T", name: "Ecommerce y moda", color: "#f59e0b", icon: "shopping-bag" }];
  const TITLES = ["Shopify baja comisiones", "Vinted cambia envíos", "Amazon sube tarifas FBA", "Instagram premia reels largos", "TikTok Shop llega España", "Correos abarata paquetería", "IVA textil sin cambios",
    "Zalando abre marketplace", "Meta limita anuncios", "YouTube paga shorts", "Kit Digital amplía plazo", "Inditex dispara beneficio", "Wallapop cobra vendedores", "Temu frena crecimiento"];
  const cands = dedupe(TITLES.map((t, i) => row({ id: `i${i}`, title: t, topic_id: "T", image_url: i === 0 ? "https://img/0.jpg" : null })));
  const ai = (scores: number[]): AiDigest => ({
    top: ["Uno", "Dos", "Tres"], idea: { text: "Sube precios un 5 %", why: "Porque..." },
    items: [...scores.map((s, i) => ({ id: `n${i + 1}`, score: s, summary: `Resumen ${i}`, action: `Haz ${i}`, business: i === 0 ? "akerra" : "Otro" })), { id: "n999", score: 5, summary: "inventada", action: "x", business: null }],
  });
  it("muestra solo las de nota 3 o más, máximo 10, de más a menos útiles; la IA no puede colar noticias", () => {
    const r = composeDigest({ candidates: cands, ai: ai([5, 2, 3, 4, 1, 5, 5, 5, 5, 5, 5, 5, 5, 3]), topics, businessNames: ["Akerra"] });
    expect(r.status).toBe("ai");
    expect(r.content.items).toHaveLength(10);
    expect(r.content.items.every((i) => (i.score ?? 0) >= 3)).toBe(true);
    expect(r.content.items.map((i) => i.score)).toEqual([...r.content.items.map((i) => i.score)].sort((a, b) => b! - a!));
    expect(r.content.items.some((i) => i.summary === "inventada")).toBe(false);
    expect(r.content.items.find((i) => i.itemId === "i0")?.business).toBe("Akerra"); // solo nombres de negocios reales
    expect(r.content.items.find((i) => i.summary === "Resumen 1")).toBeUndefined();
  });
  it("si ninguna pasa el filtro: aviso con las 3 más cercanas", () => {
    const r = composeDigest({ candidates: cands, ai: ai([2, 1, 2, 1]), topics, businessNames: [] });
    expect(r.status).toBe("empty");
    expect(r.content.items).toEqual([]);
    expect(r.content.closest.map((i) => i.score)).toEqual([2, 2, 1]);
    expect(notificationText(r.status, r.content).body).toMatch(/^Nada importante hoy/);
  });
  it("sin presupuesto (o si la IA falla): titulares con foto agrupados por tema, sin resumen", () => {
    const r = composeDigest({ candidates: cands, ai: null, topics, businessNames: [], fallbackNote: "Sin presupuesto de IA este mes: titulares sin resumen." });
    expect(r.status).toBe("fallback");
    expect(r.content.items.length).toBeLessThanOrEqual(10);
    expect(r.content.items.every((i) => i.summary === null && i.topic?.id === "T")).toBe(true);
    expect(r.content.note).toMatch(/presupuesto/);
    expect(r.content.items[0].imageUrl).toBe("https://img/0.jpg");
    expect(r.content.items[1].imageUrl).toBeNull(); // sin imagen: la tarjeta pinta el recuadro del tema
  });
  it("texto de la notificación: titular principal y cuántas hay", () => {
    const r = composeDigest({ candidates: cands, ai: ai([5, 4, 3]), topics, businessNames: [] });
    expect(notificationText(r.status, r.content)).toEqual({ title: "Tus noticias de hoy", body: expect.stringMatching(/ · y 2 más$/), image: "https://img/0.jpg" });
  });
});

describe("aviso diario", () => {
  const prefs = { news_enabled: true, news_time: "08:00:00", news_weekends: false } as Prefs;
  const d = { day: "2026-10-06", ready: true, notified: false, title: "Tus noticias de hoy", body: "x", image: null };
  it("a su hora, una vez, solo con el resumen listo y sin fines de semana si no se quieren", () => {
    expect(planNewsPush(prefs, { date: "2026-10-06", time: "07:59" }, d)).toBeNull();
    expect(planNewsPush(prefs, { date: "2026-10-06", time: "08:00" }, d)).toMatchObject({ key: "news:2026-10-06", kind: "news", url: "/noticias?dia=2026-10-06" });
    expect(planNewsPush(prefs, { date: "2026-10-06", time: "11:30" }, d)).not.toBeNull(); // tras las horas de silencio
    expect(planNewsPush(prefs, { date: "2026-10-06", time: "09:00" }, { ...d, notified: true })).toBeNull();
    expect(planNewsPush(prefs, { date: "2026-10-06", time: "09:00" }, { ...d, ready: false })).toBeNull();
    expect(planNewsPush(prefs, { date: "2026-10-10", time: "09:00" }, { ...d, day: "2026-10-10" })).toBeNull(); // sábado
    expect(planNewsPush({ ...prefs, news_weekends: true }, { date: "2026-10-10", time: "09:00" }, { ...d, day: "2026-10-10" })).not.toBeNull();
  });
});

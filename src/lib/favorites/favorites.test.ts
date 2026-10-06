import { describe, expect, it } from "vitest";
import { parseVideoAnalysis, pickCategory } from "./analysis";
import { decryptSecret, encryptSecret } from "./crypto";
import { classifyVideoUrl, firstUrl, formatDuration, parseIsoDuration } from "./url";

describe("classifyVideoUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://music.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("YouTube %s", (u, id) => {
    expect(classifyVideoUrl(u)).toEqual({ source: "youtube", externalId: id, url: `https://www.youtube.com/watch?v=${id}` });
  });
  it("TikTok largo conserva la ruta y quita el seguimiento", () => {
    expect(classifyVideoUrl("https://www.tiktok.com/@akerra/video/7234567890123456789?is_from_webapp=1")).toEqual({ source: "tiktok", externalId: "7234567890123456789", url: "https://www.tiktok.com/@akerra/video/7234567890123456789", short: false });
  });
  it("TikTok corto se marca para resolver", () => {
    expect(classifyVideoUrl("https://vm.tiktok.com/ZMabc123/")).toMatchObject({ source: "tiktok", short: true });
  });
  it("otros y no http", () => {
    expect(classifyVideoUrl("https://example.com/x")?.source).toBe("other");
    expect(classifyVideoUrl("javascript:alert(1)")).toBeNull();
    expect(classifyVideoUrl("no es una url")).toBeNull();
    expect(classifyVideoUrl("https://www.youtube.com/watch?v=corto")?.source).toBe("other");
  });
  it("evita dominios que solo imitan el nombre", () => {
    expect(classifyVideoUrl("https://youtube.com.evil.io/watch?v=dQw4w9WgXcQ")?.source).toBe("other");
  });
});

describe("duración y texto", () => {
  it("ISO 8601", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("PT20M")).toBe(1200);
    expect(parseIsoDuration("P0D")).toBeNull();
    expect(parseIsoDuration("basura")).toBeNull();
  });
  it("formato", () => { expect(formatDuration(3723)).toBe("1:02:03"); expect(formatDuration(65)).toBe("1:05"); expect(formatDuration(null)).toBe(""); });
  it("primer enlace", () => { expect(firstUrl("mira esto https://youtu.be/abc, mola")).toBe("https://youtu.be/abc"); expect(firstUrl("nada")).toBeNull(); });
});

describe("cifrado", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  it("ida y vuelta, y cada cifrado es distinto", () => {
    const a = encryptSecret("1//refresh-token", key), b = encryptSecret("1//refresh-token", key);
    expect(a).not.toBe(b);
    expect(a).not.toContain("refresh");
    expect(decryptSecret(a, key)).toBe("1//refresh-token");
  });
  it("detecta manipulación y claves incorrectas", () => {
    const t = encryptSecret("secreto", key);
    const parts = t.split(".");
    parts[3] = Buffer.from("otro").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
    expect(() => decryptSecret(t, Buffer.alloc(32, 9).toString("base64"))).toThrow();
    expect(() => encryptSecret("x", "corta")).toThrow();
  });
});

describe("análisis", () => {
  it("valida y normaliza la salida del modelo", () => {
    const a = parseVideoAnalysis('```json\n{"summary":"Resumen","key_points":["a"],"category":"Marketing","tags":["x"],"actions":[],"business":"","business_reason":null,"utility":9}\n```');
    expect(a).toMatchObject({ category: "Marketing", business: null, utility: 3 });
    expect(parseVideoAnalysis("no json")).toBeNull();
    expect(parseVideoAnalysis('{"summary":""}')).toBeNull();
  });
  it("reutiliza categorías existentes", () => {
    const ex = [{ id: "1", name: "Diseño gráfico" }];
    expect(pickCategory("diseno  grafico", ex)).toEqual({ id: "1", name: "Diseño gráfico" });
    expect(pickCategory("Ventas", ex)).toEqual({ id: null, name: "Ventas" });
    expect(pickCategory("marketing digital", ex)).toEqual({ id: null, name: "Marketing digital" });
  });
});

describe("listas de YouTube por RSS", async () => {
  const { parsePlaylistId, parseFeed, fetchPlaylistFeed, FeedError } = await import("./rss");
  it.each([
    ["https://www.youtube.com/playlist?list=PLabcdefghij123456", "PLabcdefghij123456"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghij123456&index=2", "PLabcdefghij123456"],
    ["https://m.youtube.com/playlist?list=PLabcdefghij123456&si=xyz", "PLabcdefghij123456"],
    ["  PLabcdefghij123456 ", "PLabcdefghij123456"],
  ])("acepta %s", (u, id) => expect(parsePlaylistId(u)).toBe(id));
  it.each([
    "https://www.youtube.com/playlist?list=LL", "https://www.youtube.com/playlist?list=WL", "https://evil.example/playlist?list=PLabcdefghij123456",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "PL<script>", "", "no es un enlace",
  ])("rechaza %s", (u) => expect(parsePlaylistId(u)).toBeNull());

  const xml = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
<title>Ideas &amp; negocio</title><author><name>Oier</name></author>
<entry><id>yt:video:dQw4w9WgXcQ</id><yt:videoId>dQw4w9WgXcQ</yt:videoId><title>Cómo vender &quot;más&quot; &#233;</title>
<author><name>Canal Uno</name></author><published>2026-09-01T10:00:00+00:00</published>
<media:group><media:thumbnail url="https://i1.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" width="480" height="360"/></media:group></entry>
<entry><yt:videoId>malo</yt:videoId><title>x</title></entry>
<entry><yt:videoId>abcdefghijk</yt:videoId><title>Sin autor</title><media:thumbnail url="https://evil.example/x.jpg"/></entry>
</feed>`;
  it("interpreta el feed", () => {
    const f = parseFeed(xml);
    expect(f.title).toBe("Ideas & negocio");
    expect(f.entries).toEqual([
      { id: "dQw4w9WgXcQ", title: 'Cómo vender "más" é', channel: "Canal Uno", publishedAt: "2026-09-01T10:00:00.000Z", thumbnail: "https://i1.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
      { id: "abcdefghijk", title: "Sin autor", channel: null, publishedAt: null, thumbnail: null },
    ]);
  });
  it("solo pide a youtube.com y traduce los errores", async () => {
    const urls: string[] = [];
    const ok = (async (u: string) => { urls.push(u); return new Response(xml, { status: 200 }); }) as unknown as typeof fetch;
    expect((await fetchPlaylistFeed("PLabcdefghij123456", ok)).entries).toHaveLength(2);
    expect(urls).toEqual(["https://www.youtube.com/feeds/videos.xml?playlist_id=PLabcdefghij123456"]);
    const notFound = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    await expect(fetchPlaylistFeed("PLabcdefghij123456", notFound)).rejects.toThrow(/Privada/);
    const down = (async () => { throw new Error("red"); }) as unknown as typeof fetch;
    await expect(fetchPlaylistFeed("PLabcdefghij123456", down)).rejects.toBeInstanceOf(FeedError);
    await expect(fetchPlaylistFeed("../../etc", ok)).rejects.toBeInstanceOf(FeedError);
  });
});

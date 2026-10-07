import { describe, expect, it, vi } from "vitest";
import { igAuthUrl, igContainerStatus, igCreateContainer, igDayInsights, igExchangeCode, IgError, igPublish } from "./instagram";
import { bestOfWeek, bestTimes, composeCaption, dailySeries, nextRetry, pctChange, periodTotals, rankMedia, tokenState, type MediaRow } from "./stats";
import { overallStatus } from "./service";
import { tiktokModeFor } from "./tiktok-mode";
import { postsToItems } from "@/lib/tasks/calendar";

vi.mock("@/lib/ai/gemini", () => ({}));
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

describe("Instagram: inicio de sesión y token", () => {
  it("pide solo lo necesario (perfil, publicar y estadísticas)", () => {
    const u = new URL(igAuthUrl({ appId: "1", redirectUri: "https://bi-buru.vercel.app/api/instagram/callback", state: "s" }));
    expect(u.origin).toBe("https://www.instagram.com");
    expect(u.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights");
  });
  it("código → token corto → token largo de 60 días", async () => {
    vi.stubEnv("INSTAGRAM_APP_ID", "1"); vi.stubEnv("INSTAGRAM_APP_SECRET", "s");
    const f = vi.fn(async (url: string) => url.startsWith("https://api.instagram.com") ? json({ access_token: "short", user_id: 42, permissions: ["instagram_business_basic"] }) : json({ access_token: "long", expires_in: 5183944 }));
    expect(await igExchangeCode("abc#_", "https://x/cb", f as never)).toEqual({ accessToken: "long", expiresIn: 5183944, userId: "42", scopes: "instagram_business_basic" });
    vi.unstubAllEnvs();
  });
  it("token caducado (código 190) → error de reconexión, sin reintentos", async () => {
    const f = (async () => json({ error: { message: "Error validating access token", code: 190 } }, 400)) as never;
    await expect(igDayInsights("t", "1", 0, f)).rejects.toMatchObject({ expired: true, retryable: false });
  });
  it("límite de peticiones → se reintenta", async () => {
    const f = (async () => json({ error: { message: "Application request limit reached", code: 4 } }, 400)) as never;
    await expect(igContainerStatus("t", "c", f)).rejects.toMatchObject({ retryable: true });
  });
  it("estadísticas del día (total_value)", async () => {
    const f = (async () => json({ data: [{ name: "reach", total_value: { value: 120 } }, { name: "views", total_value: { value: 300 } }, { name: "total_interactions", total_value: { value: 9 } }] })) as never;
    expect(await igDayInsights("t", "1", 1_760_000_000, f)).toEqual({ reach: 120, views: 300, total_interactions: 9 });
  });
});

describe("Instagram: publicar", () => {
  it("foto: contenedor con image_url y texto", async () => {
    const calls: { url: string; body: string }[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url, body: String(init?.body ?? "") }); return json({ id: "c1" }); });
    expect(await igCreateContainer("t", "99", { kind: "image", urls: [{ url: "https://s/1.jpg", video: false }], caption: "Hola" }, f as never)).toBe("c1");
    expect(calls[0].url).toMatch(/graph\.instagram\.com\/v\d+\.\d+\/99\/media$/);
    expect(new URLSearchParams(calls[0].body).get("image_url")).toBe("https://s/1.jpg");
  });
  it("carrusel: un contenedor por elemento y uno CAROUSEL con sus hijos", async () => {
    let n = 0;
    const bodies: URLSearchParams[] = [];
    const f = vi.fn(async (_: string, init?: RequestInit) => { bodies.push(new URLSearchParams(String(init?.body))); return json({ id: `id${++n}` }); });
    expect(await igCreateContainer("t", "99", { kind: "carousel", urls: [{ url: "https://s/1.jpg", video: false }, { url: "https://s/2.mp4", video: true }], caption: "x" }, f as never)).toBe("id3");
    expect(bodies[0].get("is_carousel_item")).toBe("true");
    expect(bodies[1].get("media_type")).toBe("VIDEO");
    expect(bodies[2].get("media_type")).toBe("CAROUSEL");
    expect(bodies[2].get("children")).toBe("id1,id2");
  });
  it("reel y publicación con enlace", async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => url.includes("media_publish") ? json({ id: "m1" }) : init?.method === "POST" ? json({ id: "c" }) : json({ permalink: "https://www.instagram.com/p/x/" }));
    expect(await igCreateContainer("t", "99", { kind: "reel", urls: [{ url: "https://s/v.mp4", video: true }], caption: "x" }, f as never)).toBe("c");
    expect(await igPublish("t", "99", "c", f as never)).toEqual({ id: "m1", permalink: "https://www.instagram.com/p/x/" });
  });
  it("IgError conserva si se puede reintentar", () => { expect(new IgError("x", 500).retryable).toBe(true); });
});

describe("estadísticas", () => {
  const rows = [{ day: "2026-10-01", followers: 100, reach: 50, views: 80, interactions: 5 }, { day: "2026-10-03", followers: 104, reach: 70, views: 90, interactions: 7 }];
  it("serie continua con huecos y totales del periodo", () => {
    expect(dailySeries(rows, "2026-10-01", "2026-10-03").map((r) => r.followers)).toEqual([100, null, 104]);
    expect(periodTotals(rows)).toEqual({ reach: 120, views: 170, interactions: 12, followers: 104, followersDelta: 4 });
    expect(pctChange(120, 100)).toBe(20);
    expect(pctChange(5, 0)).toBeNull();
  });
  const m = (id: string, posted_at: string, interactions: number): MediaRow => ({ id, caption: id, permalink: null, thumbnail_url: null, posted_at, reach: interactions * 10, views: null, interactions, likes: null, comments: null });
  const media = [m("a", "2026-10-05T18:00:00Z", 10), m("b", "2026-10-06T18:30:00Z", 30), m("c", "2026-09-29T18:10:00Z", 50), m("d", "2026-09-28T08:00:00Z", 2), m("e", "2026-10-05T08:00:00Z", 4)];
  it("ranking y mejor de la semana", () => {
    expect(rankMedia(media).map((x) => x.id)).toEqual(["c", "b", "a", "e", "d"]);
    expect(bestOfWeek(media, new Date("2026-10-07T10:00:00Z"))?.id).toBe("b");
  });
  it("mejores días y franjas en hora de Madrid (mín. 2 publicaciones)", () => {
    const t = bestTimes(media);
    expect(t.bestDay?.label).toBe("Martes"); // b (mar 6) y c (mar 29 sep): 40 de media
    expect(t.bestSlot?.label).toBe("Noche (20–24 h)"); // 20:00-20:30 en Madrid
  });
  it("aviso de caducidad y reintentos", () => {
    const now = new Date("2026-10-07T00:00:00Z");
    expect(tokenState("2026-12-01T00:00:00Z", now)).toBe("ok");
    expect(tokenState("2026-10-10T00:00:00Z", now)).toBe("expiring");
    expect(tokenState("2026-10-01T00:00:00Z", now)).toBe("expired");
    expect(nextRetry(0, now)?.toISOString()).toBe("2026-10-07T00:02:00.000Z");
    expect(nextRetry(3, now)).toBeNull();
  });
  it("texto + hashtags sin repetir", () => {
    expect(composeCaption("Nueva colección", "#verano moda, #verano")).toBe("Nueva colección\n\n#verano #moda");
  });
});

describe("programación", () => {
  it("estado general según cada red", () => {
    expect(overallStatus([{ status: "publicada" }, { status: "enviada" }])).toBe("publicada");
    expect(overallStatus([{ status: "publicada" }, { status: "error" }])).toBe("error");
    expect(overallStatus([{ status: "publicada" }, { status: "pendiente" }])).toBe("publicando");
    expect(overallStatus([{ status: "pendiente" }])).toBe("programada");
  });
  it("TikTok: directa solo auditada; si no, borrador; si no, asistida", () => {
    expect(tiktokModeFor("user.info.basic,video.publish,video.upload", true)).toBe("direct");
    expect(tiktokModeFor("user.info.basic,video.publish,video.upload", false)).toBe("draft");
    expect(tiktokModeFor("user.info.basic", false)).toBe("assisted");
  });
  it("calendario de contenido en hora de Madrid", () => {
    const [i] = postsToItems([{ id: "p", title: null, caption: "Lanzamiento", scheduled_at: "2026-10-07T22:30:00Z", status: "programada", business_id: null }]);
    expect(i).toMatchObject({ kind: "post", date: "2026-10-08", startTime: "00:30", title: "📣 Lanzamiento", done: false });
  });
});

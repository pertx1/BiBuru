import { describe, expect, it, vi } from "vitest";
import { resolveTiktokShort, tiktokOembed } from "./oembed";
import { buildAuthUrl, GoogleError, likedPage, playlistPage, refreshAccessToken, toYtVideo, videoDetails } from "./youtube";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("OAuth de Google", () => {
  it("pide solo lectura, acceso offline y lleva el state", () => {
    const u = new URL(buildAuthUrl({ clientId: "cid", redirectUri: "https://app.test/api/google/callback", state: "xyz" }));
    expect(u.searchParams.get("scope")).toContain("youtube.readonly");
    expect(u.searchParams.get("scope")).not.toMatch(/youtube(?!\.readonly)(?!\.com)\b(?!.*readonly)/);
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("state")).toBe("xyz");
  });
  it("marca como revocado un invalid_grant", async () => {
    process.env.GOOGLE_CLIENT_ID = "a"; process.env.GOOGLE_CLIENT_SECRET = "b";
    const f = vi.fn(async () => json({ error: "invalid_grant", error_description: "Token has been revoked" }, 400)) as unknown as typeof fetch;
    await expect(refreshAccessToken("r", f)).rejects.toMatchObject({ revoked: true });
  });
  it("devuelve el access token", async () => {
    process.env.GOOGLE_CLIENT_ID = "a"; process.env.GOOGLE_CLIENT_SECRET = "b";
    const f = vi.fn(async () => json({ access_token: "AT" })) as unknown as typeof fetch;
    expect(await refreshAccessToken("r", f)).toBe("AT");
  });
});

describe("API de YouTube", () => {
  const item = { id: "dQw4w9WgXcQ", snippet: { title: "T", channelTitle: "C", publishedAt: "2026-01-01T00:00:00Z", thumbnails: { medium: { url: "https://i.ytimg.com/m.jpg" } } }, contentDetails: { duration: "PT21M5S" } };
  it("normaliza un vídeo con su duración", () => {
    expect(toYtVideo(item)).toMatchObject({ id: "dQw4w9WgXcQ", title: "T", channel: "C", durationSec: 1265, thumbnail: "https://i.ytimg.com/m.jpg" });
  });
  it("pagina los «Me gusta» con el token en la cabecera", async () => {
    const f = vi.fn(async () => json({ items: [item], nextPageToken: "P2" })) as unknown as typeof fetch;
    const r = await likedPage("AT", undefined, f);
    expect(r.videos).toHaveLength(1);
    expect(r.next).toBe("P2");
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toContain("myRating=like");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer AT");
  });
  it("detalles en lotes de 50", async () => {
    const f = vi.fn(async () => json({ items: [] })) as unknown as typeof fetch;
    await videoDetails("AT", Array.from({ length: 120 }, (_, i) => `id${i}`), f);
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(3);
  });
  it("explica la cuota agotada", async () => {
    const f = vi.fn(async () => json({ error: { message: "x", errors: [{ reason: "quotaExceeded" }] } }, 403)) as unknown as typeof fetch;
    await expect(playlistPage("AT", "PL1", undefined, f)).rejects.toThrow(/Cuota diaria/);
    await expect(playlistPage("AT", "PL1", undefined, f)).rejects.toBeInstanceOf(GoogleError);
  });
});

describe("oEmbed y enlaces cortos de TikTok", () => {
  it("lee título y autor", async () => {
    const f = vi.fn(async () => json({ title: "Mi vídeo", author_name: "akerra", thumbnail_url: "https://p16.tiktokcdn.com/x.jpg" })) as unknown as typeof fetch;
    expect(await tiktokOembed("https://www.tiktok.com/@akerra/video/7234567890123456789", f)).toEqual({ title: "Mi vídeo", author: "akerra", thumbnail: "https://p16.tiktokcdn.com/x.jpg" });
  });
  it("no consulta dominios que no sean de TikTok", async () => {
    const f = vi.fn() as unknown as typeof fetch;
    expect(await tiktokOembed("https://evil.example/oembed", f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it("sigue la redirección del enlace corto", async () => {
    const f = vi.fn(async () => new Response(null, { status: 301, headers: { location: "https://www.tiktok.com/@u/video/7234567890123456789?_r=1" } })) as unknown as typeof fetch;
    expect(await resolveTiktokShort("https://vm.tiktok.com/ZMabc/", f)).toBe("https://www.tiktok.com/@u/video/7234567890123456789");
  });
  it("no sigue redirecciones fuera de TikTok (SSRF)", async () => {
    const f = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } })) as unknown as typeof fetch;
    expect(await resolveTiktokShort("https://vm.tiktok.com/ZMabc/", f)).toBeNull();
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
  });
});

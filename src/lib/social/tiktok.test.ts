import { describe, expect, it, vi } from "vitest";
import { ttAuthUrl, ttExchangeCode, ttInitUpload, ttPrivacy, ttProfile, ttPublishStatus, ttScopes, ttUpload, ttVideos } from "./tiktok";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const okErr = { error: { code: "ok", message: "" } };

describe("TikTok: inicio de sesión", () => {
  it("sin auditoría no pide publicar directamente", () => {
    expect(ttScopes(false)).not.toContain("video.publish");
    expect(ttScopes(false)).toContain("video.upload");
    expect(ttScopes(true)).toContain("video.publish");
    const u = new URL(ttAuthUrl({ clientKey: "k", redirectUri: "https://bi-buru.vercel.app/api/tiktok/callback", state: "s", scopes: ["user.info.basic"] }));
    expect(u.origin + u.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
    expect(u.searchParams.get("client_key")).toBe("k");
  });
  it("código → tokens (acceso 24 h, renovación 365 días)", async () => {
    vi.stubEnv("TIKTOK_CLIENT_KEY", "k"); vi.stubEnv("TIKTOK_CLIENT_SECRET", "s");
    const f = (async () => json({ access_token: "a", expires_in: 86400, refresh_token: "r", refresh_expires_in: 31536000, open_id: "o", scope: "user.info.basic,video.upload" })) as never;
    expect(await ttExchangeCode("c", "https://x", f)).toEqual({ accessToken: "a", expiresIn: 86400, refreshToken: "r", refreshExpiresIn: 31536000, openId: "o", scope: "user.info.basic,video.upload" });
    const bad = (async () => json({ error: "invalid_grant", error_description: "expired" }, 400)) as never;
    await expect(ttExchangeCode("c", "https://x", bad)).rejects.toMatchObject({ expired: true });
    vi.unstubAllEnvs();
  });
});

describe("TikTok: datos", () => {
  it("perfil con seguidores", async () => {
    const f = (async () => json({ data: { user: { open_id: "o", username: "akerra", display_name: "Akerra", follower_count: 1500, likes_count: 9000, video_count: 40 } }, ...okErr })) as never;
    expect(await ttProfile("t", f)).toMatchObject({ username: "akerra", followers: 1500, videos: 40 });
  });
  it("vídeos con contadores y paginación", async () => {
    let call = 0;
    const f = vi.fn(async () => json({ data: { videos: [{ id: `v${++call}`, video_description: "Hola #moda", create_time: 1_760_000_000, view_count: 100, like_count: 10, comment_count: 2, share_count: 1 }], cursor: 5, has_more: call < 2 }, ...okErr }));
    const v = await ttVideos("t", 3, f as never);
    expect(v.map((x) => x.id)).toEqual(["v1", "v2"]);
    expect(v[0]).toMatchObject({ views: 100, likes: 10, comments: 2, shares: 1, caption: "Hola #moda" });
  });
});

describe("TikTok: publicar", () => {
  it("sin auditoría, privacidad siempre privada; auditada, pública si se puede", () => {
    expect(ttPrivacy(["PUBLIC_TO_EVERYONE", "SELF_ONLY"], false)).toBe("SELF_ONLY");
    expect(ttPrivacy(["PUBLIC_TO_EVERYONE", "SELF_ONLY"], true)).toBe("PUBLIC_TO_EVERYONE");
    expect(ttPrivacy(["MUTUAL_FOLLOW_FRIENDS"], true)).toBe("MUTUAL_FOLLOW_FRIENDS");
  });
  it("borrador: va a la bandeja (inbox) y sin datos de publicación", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url, body: JSON.parse(String(init?.body)) }); return json({ data: { publish_id: "p1", upload_url: "https://open-upload.tiktokapis.com/video/?upload_id=1" }, ...okErr }); });
    expect(await ttInitUpload("t", { mode: "draft", size: 1000 }, f as never)).toEqual({ publishId: "p1", uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=1" });
    expect(calls[0].url).toBe("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/");
    expect(calls[0].body).toEqual({ source_info: { source: "FILE_UPLOAD", video_size: 1000, chunk_size: 1000, total_chunk_count: 1 } });
  });
  it("directa: con texto y privacidad", async () => {
    const bodies: Record<string, unknown>[] = [];
    const f = vi.fn(async (_: string, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return json({ data: { publish_id: "p", upload_url: "https://open-upload.tiktokapis.com/x" }, ...okErr }); });
    await ttInitUpload("t", { mode: "direct", size: 10, title: "Hola", privacy: "SELF_ONLY" }, f as never);
    expect(bodies[0]).toMatchObject({ post_info: { title: "Hola", privacy_level: "SELF_ONLY" } });
  });
  it("solo sube a servidores de TikTok, en un trozo con Content-Range", async () => {
    await expect(ttUpload("https://evil.es/up", Buffer.from("x"), "video/mp4", vi.fn() as never)).rejects.toThrow();
    const f = vi.fn(async (_: string, init?: RequestInit) => { expect((init?.headers as Record<string, string>)["Content-Range"]).toBe("bytes 0-2/3"); return new Response(null, { status: 201 }); });
    await ttUpload("https://open-upload.tiktokapis.com/video/?x=1", Buffer.from("abc"), "video/mp4", f as never);
  });
  it("estado de la publicación", async () => {
    const f = (async () => json({ data: { status: "SEND_TO_USER_INBOX" }, ...okErr })) as never;
    expect(await ttPublishStatus("t", "p", f)).toEqual({ status: "SEND_TO_USER_INBOX", reason: null, postId: null });
  });
});

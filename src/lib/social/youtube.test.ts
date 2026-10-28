import { describe, expect, it, vi } from "vitest";
import { ytAuthUrl, ytChannel, YtError, ytTags, ytTitle, ytUpload } from "./youtube";

const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", ...headers } });

describe("YouTube: conectar", () => {
  it("pide permiso para subir vídeos, con token de renovación", () => {
    const u = new URL(ytAuthUrl({ clientId: "c", redirectUri: "https://bi-buru.vercel.app/api/youtube/callback", state: "s" }));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/youtube.upload");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
  });
  it("canal propio; sin canal, error claro sin reintentos", async () => {
    const f = (async () => json({ items: [{ id: "UC1", snippet: { title: "Akerra", customUrl: "@akerra", thumbnails: { default: { url: "https://yt/a.jpg" } } }, statistics: { subscriberCount: "320" } }] })) as never;
    expect(await ytChannel("t", f)).toEqual({ id: "UC1", title: "Akerra", handle: "akerra", avatar: "https://yt/a.jpg", subscribers: 320 });
    const none = (async () => json({ items: [] })) as never;
    await expect(ytChannel("t", none)).rejects.toMatchObject({ status: 404, retryable: false });
  });
});

describe("YouTube: subir un Short", () => {
  it("título: el de la publicación o la primera línea del texto, sin < > y máx. 100", () => {
    expect(ytTitle("  Mi short ", "x")).toBe("Mi short");
    expect(ytTitle(null, "\nPrimera <línea>\nsegunda")).toBe("Primera línea");
    expect(ytTitle("", "")).toBe("Short");
    expect(ytTitle("a".repeat(150), "")).toHaveLength(100);
  });
  it("etiquetas desde los hashtags, sin # ni repetidas", () => {
    expect(ytTags("#moda #hechoamano, moda")).toEqual(["moda", "hechoamano"]);
  });
  it("subida reanudable: metadatos y después el vídeo", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return calls.length === 1 ? json({}, 200, { location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=abc" }) : json({ id: "vid1" });
    });
    const id = await ytUpload("t", { bytes: Buffer.from("video"), mime: "video/mp4" }, { title: "Hola", description: "Texto", privacy: "unlisted", madeForKids: false, tags: ["moda"] }, f as never);
    expect(id).toBe("vid1");
    expect(calls[0].url).toContain("uploadType=resumable");
    const meta = JSON.parse(String(calls[0].init?.body));
    expect(meta.status).toEqual({ privacyStatus: "unlisted", selfDeclaredMadeForKids: false });
    expect(meta.snippet).toMatchObject({ title: "Hola", description: "Texto", tags: ["moda"] });
    expect((calls[0].init?.headers as Record<string, string>)["X-Upload-Content-Length"]).toBe("5");
    expect(calls[1].init?.method).toBe("PUT");
  });
  it("visibilidad desconocida → pública; dirección de subida ajena → error", async () => {
    const f = vi.fn(async (_: string, init?: RequestInit) => (init?.method === "POST" ? json({}, 200, { location: "https://evil.example/up" }) : json({ id: "x" })));
    await expect(ytUpload("t", { bytes: Buffer.from("v"), mime: "video/mp4" }, { title: "a", description: "", privacy: "raro", madeForKids: true }, f as never)).rejects.toBeInstanceOf(YtError);
    expect(JSON.parse(String(f.mock.calls[0][1]?.body)).status.privacyStatus).toBe("public");
  });
  it("cuota agotada se reintenta; sin permiso caducado no", async () => {
    const quota = (async () => json({ error: { message: "q", errors: [{ reason: "quotaExceeded" }] } }, 403)) as never;
    await expect(ytUpload("t", { bytes: Buffer.from("v"), mime: "video/mp4" }, { title: "a", description: "", privacy: "public", madeForKids: false }, quota)).rejects.toMatchObject({ retryable: true });
    const expired = (async () => json({ error: { message: "Invalid Credentials" } }, 401)) as never;
    await expect(ytUpload("t", { bytes: Buffer.from("v"), mime: "video/mp4" }, { title: "a", description: "", privacy: "public", madeForKids: false }, expired)).rejects.toMatchObject({ expired: true, retryable: false });
  });
});

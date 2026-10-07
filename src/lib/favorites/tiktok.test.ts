import { describe, expect, it, vi } from "vitest";
import { tiktokOembedStatus } from "./oembed";
import { fetchCoverImage } from "./service";
import { allUrls, hashtags, isTiktokImageHost } from "./url";

vi.mock("@/lib/ai/gemini", () => ({ uploadGeminiFile: vi.fn(), deleteGeminiFile: vi.fn(), geminiProvider: vi.fn(), getModelNames: () => ({ fast: "f", video: "v" }) }));

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

describe("pegar varios enlaces", () => {
  it("saca todos, sin repetir, quitando la puntuación final", () => {
    expect(allUrls("mira https://vm.tiktok.com/ZMabc/ y https://www.youtube.com/watch?v=abc. y otra vez https://vm.tiktok.com/ZMabc/")).toEqual(["https://vm.tiktok.com/ZMabc/", "https://www.youtube.com/watch?v=abc"]);
    expect(allUrls("sin enlaces")).toEqual([]);
    expect(allUrls(Array.from({ length: 30 }, (_, i) => `https://x.es/${i}`).join(" "))).toHaveLength(20);
  });
  it("hashtags de la descripción", () => {
    expect(hashtags("Cómo vender más #Emprender #ventas #emprender #a")).toEqual(["emprender", "ventas"]);
  });
  it("portadas solo de los servidores de imágenes de TikTok", () => {
    expect(isTiktokImageHost("https://p16-sign-va.tiktokcdn.com/obj/x.jpeg")).toBe(true);
    expect(isTiktokImageHost("https://p19-common-sign.tiktokcdn-us.com/x.jpg")).toBe(true);
    expect(isTiktokImageHost("http://p16.tiktokcdn.com/x.jpg")).toBe(false);
    expect(isTiktokImageHost("https://tiktokcdn.com.evil.es/x.jpg")).toBe(false);
    expect(isTiktokImageHost("https://169.254.169.254/latest")).toBe(false);
  });
});

describe("oEmbed oficial de TikTok", () => {
  const url = "https://www.tiktok.com/@akerra/video/7234567890123456789";
  it("datos del vídeo", async () => {
    const f = vi.fn(async () => json({ title: "Pack verano #moda", author_name: "akerra", thumbnail_url: "https://p16.tiktokcdn.com/x.jpg" })) as unknown as typeof fetch;
    expect(await tiktokOembedStatus(url, f)).toEqual({ title: "Pack verano #moda", author: "akerra", thumbnail: "https://p16.tiktokcdn.com/x.jpg" });
  });
  it("privado o borrado → no disponible; caída de red → desconocido", async () => {
    expect(await tiktokOembedStatus(url, (async () => json({ code: 400 }, 400)) as unknown as typeof fetch)).toBe("unavailable");
    expect(await tiktokOembedStatus(url, (async () => json({ code: 10204, message: "not found" })) as unknown as typeof fetch)).toBe("unavailable");
    expect(await tiktokOembedStatus(url, (async () => json({}, 503)) as unknown as typeof fetch)).toBeNull();
    expect(await tiktokOembedStatus(url, (async () => { throw new Error("red"); }) as unknown as typeof fetch)).toBeNull();
  });
});

describe("portada como imagen", () => {
  it("descarga la imagen en base64 solo si es una imagen y pesa poco", async () => {
    const img = (type: string, bytes = 10) => (async () => new Response(new Uint8Array(bytes), { headers: { "content-type": type } })) as unknown as typeof fetch;
    expect(await fetchCoverImage("https://p16.tiktokcdn.com/x.jpg", img("image/jpeg"))).toEqual({ mimeType: "image/jpeg", data: Buffer.alloc(10).toString("base64") });
    expect(await fetchCoverImage("https://p16.tiktokcdn.com/x.jpg", img("text/html"))).toBeNull();
    expect(await fetchCoverImage("https://p16.tiktokcdn.com/x.jpg", img("image/jpeg", 4 * 1024 * 1024))).toBeNull();
    expect(await fetchCoverImage("https://evil.es/x.jpg", img("image/jpeg"))).toBeNull();
    expect(await fetchCoverImage(null)).toBeNull();
  });
});

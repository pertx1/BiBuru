import { describe, expect, it } from "vitest";
import { fetchTiktokVideo, isTiktokMediaHost, parseTiktokPage, parseTikwm } from "./tiktok-video";

const PAGE = "https://www.tiktok.com/@akerra/video/7234567890123456789";
const PLAY = "https://v16-webapp-prime.tiktok.com/video/tos/abc.mp4";
const html = (video: object) => `<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ __DEFAULT_SCOPE__: { "webapp.video-detail": { itemInfo: { itemStruct: { id: "1", video } } } } })}</script></html>`;
const mp4 = Buffer.from("fake-mp4-bytes");

type Route = (url: string, init: RequestInit) => Response;
function fakeFetch(routes: Record<string, Route>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const f = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    return key ? routes[key](url, init) : new Response("no", { status: 404 });
  }) as typeof fetch;
  return { f, calls };
}
const video = (body: Buffer = mp4, type = "video/mp4") => new Response(new Uint8Array(body), { headers: { "content-type": type } });

describe("vídeo de TikTok", () => {
  it("solo dominios de TikTok, sus CDN y tikwm", () => {
    expect(isTiktokMediaHost(PLAY)).toBe(true);
    expect(isTiktokMediaHost("https://v19.tiktokcdn-eu.com/x.mp4")).toBe(true);
    expect(isTiktokMediaHost("https://www.tikwm.com/video/media/play/1.mp4")).toBe(true);
    expect(isTiktokMediaHost("https://eviltiktok.com/x")).toBe(false);
    expect(isTiktokMediaHost("http://www.tiktok.com/x")).toBe(false);
    expect(isTiktokMediaHost("https://169.254.169.254/latest")).toBe(false);
  });

  it("lee las direcciones y la duración de la página", () => {
    expect(parseTiktokPage(html({ playAddr: PLAY, duration: 42, bitrateInfo: [{ PlayAddr: { UrlList: [PLAY, "https://v19.tiktokcdn.com/b.mp4", "https://otro.com/c.mp4"] } }] })))
      .toEqual({ urls: [PLAY, "https://v19.tiktokcdn.com/b.mp4"], durationSec: 42 });
    expect(parseTiktokPage("<html>sin datos</html>")).toBeNull();
    expect(parseTiktokPage(html({ duration: 5 }))).toBeNull();
  });

  it("tikwm: dirección relativa y carrusel de fotos", () => {
    expect(parseTikwm({ code: 0, data: { play: "/video/media/play/1.mp4", duration: 9 } })).toEqual({ urls: ["https://www.tikwm.com/video/media/play/1.mp4"], durationSec: 9 });
    expect(parseTikwm({ code: 0, data: { images: ["a.jpg"], play: "/x.mp4" } })).toBeNull();
    expect(parseTikwm({ code: -1, msg: "error" })).toBeNull();
  });

  it("baja el vídeo con las cookies de la página", async () => {
    const { f, calls } = fakeFetch({
      [PAGE]: () => new Response(html({ playAddr: PLAY, duration: 30 }), { headers: [["content-type", "text/html"], ["set-cookie", "tt_chain_token=abc; Path=/"], ["set-cookie", "ttwid=xyz; Path=/"]] }),
      [PLAY]: () => video(),
    });
    const v = await fetchTiktokVideo(PAGE, { f, tikwm: false });
    expect(v).toMatchObject({ mimeType: "video/mp4", durationSec: 30, via: "tiktok" });
    expect(v?.bytes.equals(mp4)).toBe(true);
    expect(calls[1].headers).toMatchObject({ Cookie: "tt_chain_token=abc; ttwid=xyz", Referer: "https://www.tiktok.com/" });
  });

  it("si TikTok bloquea la página, usa tikwm", async () => {
    const { f, calls } = fakeFetch({
      [PAGE]: () => new Response("captcha", { status: 403 }),
      "https://www.tikwm.com/api/": () => Response.json({ code: 0, data: { play: "/video/media/play/7.mp4", duration: 12 } }),
      "https://www.tikwm.com/video/": () => video(),
    });
    expect(await fetchTiktokVideo(PAGE, { f, tikwm: true })).toMatchObject({ via: "tikwm", durationSec: 12 });
    expect(calls.map((c) => new URL(c.url).hostname)).toEqual(["www.tiktok.com", "www.tikwm.com", "www.tikwm.com"]);
  });

  it("no sigue redirecciones fuera de TikTok, no baja lo que no es vídeo y respeta el tamaño máximo", async () => {
    const redirect = fakeFetch({
      [PAGE]: () => new Response(html({ playAddr: PLAY }), { headers: { "content-type": "text/html" } }),
      [PLAY]: () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }),
    });
    expect(await fetchTiktokVideo(PAGE, { f: redirect.f, tikwm: false })).toBeNull();
    expect(redirect.calls.some((c) => c.url.includes("169.254"))).toBe(false);

    const html404 = fakeFetch({ [PAGE]: () => new Response(html({ playAddr: PLAY })), [PLAY]: () => video(mp4, "text/html") });
    expect(await fetchTiktokVideo(PAGE, { f: html404.f, tikwm: false })).toBeNull();

    const big = fakeFetch({ [PAGE]: () => new Response(html({ playAddr: PLAY })), [PLAY]: () => video(Buffer.alloc(2000)) });
    expect(await fetchTiktokVideo(PAGE, { f: big.f, tikwm: false, maxBytes: 1000 })).toBeNull();
  });

  it("solo enlaces de vídeo de TikTok (no fotos ni otros dominios)", async () => {
    const { f, calls } = fakeFetch({});
    expect(await fetchTiktokVideo("https://www.tiktok.com/@a/photo/123", { f })).toBeNull();
    expect(await fetchTiktokVideo("https://example.com/video/123", { f })).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

/**
 * Descarga del vídeo de un TikTok público para que Gemini lo vea entero (a petición de la persona: no hay API oficial
 * para esto). Primero la página pública del vídeo (los datos van en un JSON incrustado y la descarga necesita sus
 * cookies); si TikTok la bloquea, el servicio público tikwm.com. Solo se contacta con dominios de TikTok y tikwm,
 * con tiempo y tamaño máximos y redirecciones comprobadas (anti-SSRF). Si todo falla, se analiza con el texto y la portada.
 */
type Fetch = typeof fetch;
export type TiktokVideo = { bytes: Buffer; mimeType: string; durationSec: number | null; via: "tiktok" | "tikwm" };
export type TiktokMeta = { urls: string[]; durationSec: number | null };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
export const TIKTOK_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/** Dominios desde los que se puede descargar: TikTok, sus CDN y tikwm. */
export function isTiktokMediaHost(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  return u.protocol === "https:" && !u.username && !u.port &&
    /(^|\.)(tiktok\.com|tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com|tiktokv\.com|tiktokv\.us|tiktokv\.eu|ibytedtos\.com|byteoversea\.com|tikwm\.com)$/i.test(u.hostname);
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
const str = (v: unknown) => (typeof v === "string" && v.startsWith("https://") ? v : null);

/** Direcciones del vídeo y duración desde el JSON incrustado de la página de TikTok. */
export function parseTiktokPage(html: string): TiktokMeta | null {
  const m = html.match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)
    ?? html.match(/<script[^>]+id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let data: Record<string, unknown>;
  try { data = JSON.parse(m[1]); } catch { return null; }
  const scope = data.__DEFAULT_SCOPE__ as Record<string, Record<string, unknown>> | undefined;
  const detail = scope?.["webapp.video-detail"] as { itemInfo?: { itemStruct?: Record<string, unknown> } } | undefined;
  let item = detail?.itemInfo?.itemStruct;
  if (!item) { const mod = data.ItemModule as Record<string, Record<string, unknown>> | undefined; item = mod ? Object.values(mod)[0] : undefined; }
  const video = item?.video as Record<string, unknown> | undefined;
  if (!video) return null;
  const urls: string[] = [];
  const add = (u: string | null) => { if (u && isTiktokMediaHost(u) && !urls.includes(u)) urls.push(u); };
  add(str(video.playAddr));
  add(str(video.downloadAddr));
  for (const b of (Array.isArray(video.bitrateInfo) ? video.bitrateInfo : []) as { PlayAddr?: { UrlList?: unknown[] } }[]) for (const u of b.PlayAddr?.UrlList ?? []) add(str(u));
  return urls.length ? { urls, durationSec: num(video.duration) } : null;
}

/** Respuesta de tikwm.com/api: `data.play` (sin marca de agua; a veces relativa a tikwm.com) y `data.duration`. */
export function parseTikwm(json: unknown): TiktokMeta | null {
  const j = json as { code?: number; data?: { play?: unknown; wmplay?: unknown; duration?: unknown; images?: unknown } } | null;
  if (!j || j.code !== 0 || !j.data || Array.isArray(j.data.images)) return null; // `images` = carrusel de fotos, sin vídeo
  const abs = (v: unknown) => (typeof v === "string" && v ? (v.startsWith("/") ? `https://www.tikwm.com${v}` : v) : null);
  const urls = [abs(j.data.play), abs(j.data.wmplay)].filter((u): u is string => !!u && isTiktokMediaHost(u));
  return urls.length ? { urls, durationSec: num(j.data.duration) } : null;
}

/**
 * Solo pruebas locales (scripts/e2e/tiktok-video.mjs): manda las peticiones a un TikTok falso
 * (`https://host/ruta` → `<base>/host/ruta`). Nunca se activa en Vercel.
 */
function target(url: string): string {
  const base = process.env.TIKTOK_FETCH_TEST_BASE;
  if (!base || process.env.VERCEL) return url;
  const u = new URL(url);
  return `${base}/${u.hostname}${u.pathname}${u.search}`;
}

/** GET siguiendo redirecciones solo dentro de los dominios permitidos. */
async function get(f: Fetch, url: string, headers: Record<string, string>, timeoutMs: number): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    if (!isTiktokMediaHost(current)) return null;
    const res = await f(target(current), { redirect: "manual", headers, signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
    if (!res) return null;
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  return null;
}

async function readCapped(res: Response, max: number): Promise<Buffer | null> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > max) return null;
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Buffer[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(Buffer.from(value));
  }
  return size ? Buffer.concat(chunks) : null;
}

async function download(f: Fetch, meta: TiktokMeta, headers: Record<string, string>, max: number): Promise<{ bytes: Buffer; mimeType: string } | null> {
  for (const u of meta.urls) {
    const res = await get(f, u, { "User-Agent": UA, Referer: "https://www.tiktok.com/", Accept: "video/*,*/*;q=0.8", ...headers }, 30_000);
    if (!res?.ok) continue;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (type && !type.startsWith("video/") && type !== "application/octet-stream" && type !== "binary/octet-stream") continue;
    const bytes = await readCapped(res, max).catch(() => null);
    if (bytes) return { bytes, mimeType: type.startsWith("video/") ? type : "video/mp4" };
  }
  return null;
}

/** Cookies de la respuesta (TikTok exige las de la página, p. ej. `tt_chain_token`, para servir el vídeo). */
function cookiesOf(res: Response): string {
  const list = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  return list.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

/** Baja el vídeo de un TikTok público (página → tikwm); null si no se puede (privado, foto, bloqueo, demasiado grande). */
export async function fetchTiktokVideo(pageUrl: string, o: { f?: Fetch; maxBytes?: number; tikwm?: boolean } = {}): Promise<TiktokVideo | null> {
  const f = o.f ?? fetch;
  const max = o.maxBytes ?? TIKTOK_VIDEO_MAX_BYTES;
  if (!isTiktokMediaHost(pageUrl) || !/\/video\/\d+/.test(new URL(pageUrl).pathname)) return null;

  // 1) Página pública del vídeo.
  const page = await get(f, pageUrl, { "User-Agent": UA, Accept: "text/html", "Accept-Language": "es-ES,es;q=0.9" }, 12_000);
  if (page?.ok) {
    const cookie = cookiesOf(page);
    const html = (await readCapped(page, 5_000_000).catch(() => null))?.toString("utf8") ?? "";
    const meta = parseTiktokPage(html);
    if (meta) {
      const v = await download(f, meta, cookie ? { Cookie: cookie } : {}, max);
      if (v) return { ...v, durationSec: meta.durationSec, via: "tiktok" };
    }
  }

  // 2) Respaldo: tikwm.com (público, sin clave). Se puede apagar con TIKTOK_FETCH_FALLBACK=off.
  if (o.tikwm ?? process.env.TIKTOK_FETCH_FALLBACK !== "off") {
    const res = await get(f, `https://www.tikwm.com/api/?hd=0&url=${encodeURIComponent(pageUrl)}`, { "User-Agent": UA, Accept: "application/json" }, 12_000);
    const meta = res?.ok ? parseTikwm(await res.json().catch(() => null)) : null;
    if (meta) {
      const v = await download(f, meta, {}, max);
      if (v) return { ...v, durationSec: meta.durationSec, via: "tikwm" };
    }
  }
  return null;
}

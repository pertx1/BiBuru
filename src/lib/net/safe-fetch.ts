import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Descarga de direcciones que escribe la persona (feeds, portadas): solo http(s) a direcciones públicas, con tiempo
 * y tamaño máximos y redirecciones comprobadas una a una. Evita que un enlace haga al servidor pedir algo interno (SSRF).
 */
export class FetchError extends Error {}

function privateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const m = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? privateIp(m[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new FetchError("Dirección no válida"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new FetchError("Solo http(s)");
  if (u.username || u.password) throw new FetchError("Dirección no válida");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  // Solo pruebas locales (scripts/e2e): nunca se activa en Vercel.
  if (process.env.SAFE_FETCH_ALLOW_LOCAL === "1" && !process.env.VERCEL && (host === "localhost" || host === "127.0.0.1")) return u;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new FetchError("Dirección no permitida");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => { throw new FetchError("No se encuentra el servidor"); })).map((r) => r.address);
  if (!ips.length || ips.some(privateIp)) throw new FetchError("Dirección no permitida");
  return u;
}

export async function safeFetchText(url: string, o: { timeoutMs?: number; maxBytes?: number; accept?: string } = {}): Promise<{ text: string; finalUrl: string; contentType: string }> {
  const max = o.maxBytes ?? 2_000_000;
  const signal = AbortSignal.timeout(o.timeoutMs ?? 6000);
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const u = await assertPublicUrl(current);
    const res = await fetch(u, { redirect: "manual", signal, headers: { Accept: o.accept ?? "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/html;q=0.8", "User-Agent": "BiBuru/1.0 (+lector personal de noticias)" } })
      .catch((e) => { throw new FetchError(e?.name === "TimeoutError" ? "Tardó demasiado" : "No responde"); });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new FetchError(`Redirección sin destino (${res.status})`);
      current = new URL(loc, u).toString();
      continue;
    }
    if (!res.ok) throw new FetchError(`Responde con error ${res.status}`);
    // Lectura con tope de tamaño.
    const reader = res.body?.getReader();
    if (!reader) return { text: "", finalUrl: u.toString(), contentType: res.headers.get("content-type") ?? "" };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); break; }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return { text: buf.toString("utf8"), finalUrl: u.toString(), contentType: res.headers.get("content-type") ?? "" };
  }
  throw new FetchError("Demasiadas redirecciones");
}

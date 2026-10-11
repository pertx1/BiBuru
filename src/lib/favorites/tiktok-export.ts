/**
 * Importar los Favoritos y «Me gusta» de TikTok desde «Descargar tus datos» (TikTok no los da por su API).
 * Lógica pura, sin red: se ejecuta en el navegador (el archivo no se sube; solo los identificadores de los vídeos).
 * Admite el ZIP tal cual lo da TikTok, el JSON o los TXT de dentro.
 */
export type ExportItem = { id: string; date: string | null };
export type TiktokExport = { favorites: ExportItem[]; likes: ExportItem[] };

const VIDEO_ID = /\/(?:video|v)\/(\d{6,25})/;

/** Identificador del vídeo en cualquier enlace de TikTok (tiktok.com/@x/video/ID, tiktokv.com/share/video/ID/…). */
export function videoIdFromLink(link: string): string | null {
  if (!/^https?:\/\/([a-z0-9-]+\.)*(tiktok\.com|tiktokv\.com|tiktokv\.us|tiktokv\.eu)\//i.test(link.trim())) return null;
  return VIDEO_ID.exec(link)?.[1] ?? null;
}

/** Enlace con el que se guarda un vídeo importado (TikTok redirige al del autor). */
export const tiktokUrlFor = (id: string) => `https://www.tiktok.com/@/video/${id}`;

type Kind = "favorites" | "likes" | null;
/** Sección según el nombre de la clave o del archivo: favoritos de vídeos o «me gusta» (no sonidos, hashtags ni efectos). */
function kindOf(name: string): Kind {
  if (/sound|hashtag|effect|music|sonido/i.test(name)) return null;
  if (/favou?rite ?video|favoritevideo|favoritos?/i.test(name)) return "favorites";
  if (/like ?list|itemfavoritelist|liked|me ?gusta/i.test(name)) return "likes";
  return null;
}

function normDate(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 19) : null;
}

function finish(map: { favorites: Map<string, string | null>; likes: Map<string, string | null> }): TiktokExport {
  const list = (m: Map<string, string | null>) => [...m].map(([id, date]) => ({ id, date })).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return { favorites: list(map.favorites), likes: list(map.likes) };
}

/** JSON del export: se recorre entero y se recogen los enlaces dentro de las secciones de favoritos y «me gusta». */
export function parseExportJson(data: unknown): TiktokExport {
  const out = { favorites: new Map<string, string | null>(), likes: new Map<string, string | null>() };
  const walk = (node: unknown, kind: Kind, depth: number) => {
    if (depth > 12 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const x of node) walk(x, kind, depth + 1); return; }
    const o = node as Record<string, unknown>;
    const link = o.Link ?? o.link ?? o.VideoLink ?? o.videoLink;
    if (kind && typeof link === "string") {
      const id = videoIdFromLink(link);
      if (id && !out[kind].has(id)) out[kind].set(id, normDate(o.Date ?? o.date));
    }
    for (const [k, v] of Object.entries(o)) walk(v, kindOf(k) ?? (/sound|hashtag|effect/i.test(k) ? null : kind), depth + 1);
  };
  walk(data, null, 0);
  return finish(out);
}

/** TXT del export («Date: …» / «Link: …»); la sección sale del nombre del archivo o de los títulos dentro. */
export function parseExportTxt(text: string, fileName = ""): TiktokExport {
  const out = { favorites: new Map<string, string | null>(), likes: new Map<string, string | null>() };
  let kind: Kind = kindOf(fileName);
  let date: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // Título de sección («Favorite Videos», «Like List», «Video Browsing History»…): una línea corta que no es «Clave: valor» ni enlace.
    if (line.length < 80 && !/^https?:/i.test(line) && !/^[\w ]+:\s*\S/.test(line)) { kind = kindOf(line); continue; }
    const d = /^date\s*:\s*(.+)$/i.exec(line);
    if (d) { date = normDate(d[1].trim()); continue; }
    const l = /^(?:link\s*:\s*)?(https?:\/\/\S+)/i.exec(line);
    const id = l ? videoIdFromLink(l[1]) : null;
    if (id && kind && !out[kind].has(id)) out[kind].set(id, date);
    if (l) date = null;
  }
  return finish(out);
}

function merge(parts: TiktokExport[]): TiktokExport {
  const out = { favorites: new Map<string, string | null>(), likes: new Map<string, string | null>() };
  for (const p of parts) for (const k of ["favorites", "likes"] as const) for (const i of p[k]) if (!out[k].has(i.id)) out[k].set(i.id, i.date);
  return finish(out);
}

// ------------------------------------------------------------------ ZIP (sin dependencias: directorio central + deflate-raw)
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Archivos .json y .txt de un ZIP (máx. 200 MB descomprimidos en total). */
export async function readZipTexts(buf: Uint8Array): Promise<{ name: string; text: string }[]> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("No es un ZIP válido");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out: { name: string; text: string }[] = [];
  let total = 0;
  const dec = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/\.(json|txt)$/i.test(name) || /(^|\/)__MACOSX\//.test(name)) continue;
    total += usize;
    if (total > 200 * 1024 * 1024) throw new Error("El ZIP es demasiado grande");
    if (dv.getUint32(local, true) !== 0x04034b50) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = buf.subarray(start, start + csize);
    const bytes = method === 0 ? raw : method === 8 ? await inflateRaw(raw) : null;
    if (bytes) out.push({ name, text: dec.decode(bytes) });
  }
  return out;
}

/** Lee el archivo que elige la persona (ZIP, JSON o TXT). */
export async function parseTiktokExportFile(name: string, bytes: Uint8Array): Promise<TiktokExport> {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const files = isZip ? await readZipTexts(bytes) : [{ name, text: new TextDecoder().decode(bytes) }];
  const parts = files.map((f) => {
    if (/\.json$/i.test(f.name) || /^\s*[{[]/.test(f.text)) {
      try { return parseExportJson(JSON.parse(f.text)); } catch { return parseExportTxt(f.text, f.name); }
    }
    return parseExportTxt(f.text, f.name);
  });
  return merge(parts);
}

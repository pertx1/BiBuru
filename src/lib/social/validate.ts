/**
 * Comprobaciones antes de subir (lógica pura, con tests; se usa en el navegador con los datos del propio archivo).
 * Errores = no se sube. Avisos = se sube, pero la red puede recortarlo o rechazarlo.
 */
export const SOCIAL_MIME = ["image/jpeg", "image/png", "video/mp4", "video/quicktime"] as const;
/** Límite de subida de un archivo en el plan gratis de Supabase. */
export const SOCIAL_MAX_FILE = 50 * 1024 * 1024;
export const CAPTION_MAX = 2200;

export type MediaInfo = { mime: string; size: number; durationSec?: number | null; width?: number | null; height?: number | null };
export type Check = { errors: string[]; warnings: string[] };

const mb = (b: number) => `${Math.round(b / 1024 / 1024)} MB`;
const ratioText = (w: number, h: number) => (Math.abs(w / h - 9 / 16) < 0.02 ? "9:16" : `${w}×${h}`);

export function checkMedia(f: MediaInfo, o: { tiktok?: boolean } = {}): Check {
  const errors: string[] = [], warnings: string[] = [];
  if (!(SOCIAL_MIME as readonly string[]).includes(f.mime)) errors.push("Formato no válido: usa JPG, PNG, MP4 o MOV.");
  if (f.size > SOCIAL_MAX_FILE) errors.push(`Pesa ${mb(f.size)} y el máximo es 50 MB (límite del plan gratis). Expórtalo con menos calidad o recórtalo.`);
  const w = f.width ?? 0, h = f.height ?? 0;
  if (f.mime.startsWith("video/")) {
    const d = f.durationSec ?? null;
    if (d != null && d < 3) errors.push("El vídeo dura menos de 3 s: Instagram no lo acepta.");
    if (d != null && d > 900) errors.push("El vídeo pasa de 15 min: es el máximo de los Reels.");
    if (d != null && o.tiktok && d > 600) warnings.push("TikTok solo admite hasta 10 min (en muchas cuentas, menos): puede rechazarlo.");
    if (w && h) {
      const r = w / h;
      if (r < 0.5 || r > 0.6) warnings.push(`No es vertical 9:16 (${ratioText(w, h)}): en Reels y TikTok saldrá con bandas o recortado.`);
      if (Math.min(w, h) < 540) warnings.push("Resolución baja: se verá borroso (mejor 1080×1920).");
    }
  } else if (f.mime.startsWith("image/") && w && h) {
    const r = w / h;
    if (r < 0.8 || r > 1.91) warnings.push(`Instagram solo publica fotos entre 4:5 y 1,91:1 (esta es ${ratioText(w, h)}): puede rechazarla.`);
    if (f.size > 8 * 1024 * 1024) warnings.push("La foto pasa de 8 MB: Instagram puede rechazarla.");
  }
  return { errors, warnings };
}

/** Texto: 2.200 caracteres como máximo (con los hashtags), 30 hashtags y 20 menciones (límites de Instagram). */
export function checkCaption(text: string): Check {
  const errors: string[] = [], warnings: string[] = [];
  if (text.length > CAPTION_MAX) errors.push(`El texto tiene ${text.length} caracteres (máx. ${CAPTION_MAX} con los hashtags).`);
  const tags = text.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  if (tags > 30) errors.push(`Hay ${tags} hashtags: Instagram admite 30 como máximo.`);
  const mentions = text.match(/(^|\s)@[\w.]+/g)?.length ?? 0;
  if (mentions > 20) errors.push(`Hay ${mentions} menciones: Instagram admite 20 como máximo.`);
  return { errors, warnings };
}

/**
 * Modo de publicación en TikTok según lo que permita la app (paso 7):
 * - direct: publicación directa (solo cuando TikTok haya auditado la app: TIKTOK_DIRECT_POST_AUDITED=1 y permiso video.publish).
 * - draft: se envía a la bandeja de TikTok como borrador para terminarlo allí (permiso video.upload; sin auditoría).
 * - assisted: aviso a la hora con el vídeo y el texto listos (sin ningún permiso de publicación).
 */
export function tiktokModeFor(scopes: string | null | undefined, audited = process.env.TIKTOK_DIRECT_POST_AUDITED === "1"): "direct" | "draft" | "assisted" {
  const s = (scopes ?? "").split(/[\s,]+/);
  if (audited && s.includes("video.publish")) return "direct";
  if (s.includes("video.upload")) return "draft";
  return "assisted";
}

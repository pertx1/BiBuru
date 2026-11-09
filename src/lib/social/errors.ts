/**
 * Errores de Instagram y TikTok traducidos a un español claro (lógica pura, con tests). Si no se conoce el código,
 * se deja el mensaje original con el nombre de la red delante.
 */

/** Subcódigos de la API de publicación de Instagram (error_subcode). */
const IG_SUBCODES: Record<number, string> = {
  2207001: "Instagram ha dado un error al procesar el archivo. Se reintenta solo.",
  2207003: "Instagram tardó demasiado en descargar el archivo. Se reintenta solo.",
  2207004: "La foto es demasiado grande para Instagram (máx. 8 MB).",
  2207005: "Formato de foto no válido: usa JPG.",
  2207006: "No se encontró la publicación en Instagram (puede que se borrara).",
  2207008: "El contenedor de Instagram ha caducado (más de 24 h). Se vuelve a crear.",
  2207009: "La proporción de la foto no vale para Instagram: entre 4:5 (vertical) y 1,91:1 (horizontal).",
  2207010: "El texto es demasiado largo: máximo 2.200 caracteres, 30 hashtags y 20 menciones.",
  2207020: "El vídeo ha caducado en Instagram. Se vuelve a subir.",
  2207026: "Formato de vídeo no válido: usa MP4 o MOV (H.264, AAC), de 3 s a 15 min.",
  2207027: "Instagram aún está procesando el vídeo. Se reintenta solo.",
  2207032: "No se pudo crear la publicación en Instagram. Se reintenta solo.",
  2207042: "Has llegado al límite de publicaciones de Instagram en 24 h. Se publicará cuando quede cupo.",
  2207050: "Instagram tiene la cuenta restringida o inactiva: entra en la app de Instagram y revísala.",
  2207052: "Instagram no pudo descargar el archivo. Se reintenta solo.",
  2207053: "Error desconocido de Instagram al subir el vídeo. Se reintenta solo.",
  2207057: "La miniatura del vídeo no es válida.",
};

export function igFriendlyError(o: { code?: number; subcode?: number; status?: number; message?: string }): string {
  if (o.subcode && IG_SUBCODES[o.subcode]) return IG_SUBCODES[o.subcode];
  if (o.code === 190 || o.status === 401) return "La conexión con Instagram ha caducado o se ha quitado el permiso: vuelve a conectar la cuenta en Redes.";
  if (o.code === 10 || o.code === 200) return "Falta un permiso de Instagram: desconecta y vuelve a conectar la cuenta aceptando todos los permisos.";
  if (o.code === 4 || o.code === 17 || o.code === 32 || o.code === 613 || o.status === 429) return "Instagram está limitando las peticiones ahora mismo. Se reintenta solo.";
  if (o.code === 9007) return "Instagram aún no ha terminado de procesar el archivo. Se reintenta solo.";
  if (o.code === 2 || (o.status ?? 0) >= 500) return "Instagram no responde ahora mismo. Se reintenta solo.";
  return `Instagram: ${(o.message || String(o.status ?? "error")).slice(0, 250)}`;
}

const TT_CODES: Record<string, string> = {
  access_token_invalid: "La conexión con TikTok ha caducado: vuelve a conectar la cuenta en Redes.",
  invalid_grant: "La conexión con TikTok ha caducado: vuelve a conectar la cuenta en Redes.",
  scope_not_authorized: "Falta un permiso de TikTok: desconecta y vuelve a conectar la cuenta aceptando todos los permisos.",
  scope_permission_missed: "Falta un permiso de TikTok: desconecta y vuelve a conectar la cuenta aceptando todos los permisos.",
  rate_limit_exceeded: "TikTok está limitando las peticiones ahora mismo. Se reintenta solo.",
  spam_risk_too_many_posts: "TikTok no deja subir más vídeos hoy desde esta cuenta (límite diario). Prueba mañana.",
  spam_risk_too_many_pending_share: "Tienes demasiados borradores sin publicar en la bandeja de TikTok: publica o borra alguno y reintenta.",
  spam_risk_user_banned_from_posting: "TikTok no deja publicar a esta cuenta ahora mismo.",
  reached_active_user_cap: "La app de TikTok ha llegado a su límite diario de usuarios. Prueba mañana.",
  unaudited_client_can_only_post_to_private_accounts: "Sin la revisión de TikTok solo se puede publicar en privado: usa el modo borrador.",
  file_format_check_failed: "Formato de vídeo no válido para TikTok: usa MP4 o MOV.",
  duration_check_failed: "El vídeo es demasiado largo o corto para esta cuenta de TikTok.",
  frame_rate_check_failed: "TikTok no acepta los fotogramas por segundo de este vídeo (23–60 fps).",
  picture_size_check_failed: "La resolución del vídeo no vale para TikTok (mín. 360 px).",
  video_pull_failed: "TikTok no pudo descargar el vídeo. Se reintenta solo.",
  internal_error: "TikTok ha dado un error interno. Se reintenta solo.",
};

export function ttFriendlyError(o: { code?: string; status?: number; message?: string }): string {
  if (o.code && TT_CODES[o.code]) return TT_CODES[o.code];
  if (o.status === 401) return TT_CODES.access_token_invalid;
  if (o.status === 429) return TT_CODES.rate_limit_exceeded;
  if ((o.status ?? 0) >= 500) return "TikTok no responde ahora mismo. Se reintenta solo.";
  return `TikTok: ${(o.message || o.code || String(o.status ?? "error")).slice(0, 250)}`;
}

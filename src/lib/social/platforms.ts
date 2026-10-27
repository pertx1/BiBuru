/** Redes y formatos de publicación: lógica pura, compartida por el editor y el servidor (probada en tests). */

export type Platform = "instagram" | "tiktok" | "youtube";
export type PostFormat = "post" | "reel" | "story" | "video" | "short";

export const PLATFORM_LABEL: Record<Platform, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" };
export const platformLabel = (p: string) => PLATFORM_LABEL[p as Platform] ?? p;

export const FORMAT_LABEL: Record<PostFormat, string> = { post: "Post", reel: "Reel", story: "Historia", video: "Vídeo", short: "Short" };

/** Formatos que admite cada red, en el orden en que salen en el editor. */
export const PLATFORM_FORMATS: Record<Platform, PostFormat[]> = {
  instagram: ["post", "reel", "story"],
  tiktok: ["video", "story"],
  youtube: ["short"],
};
export const formatsFor = (p: string): PostFormat[] => PLATFORM_FORMATS[p as Platform] ?? [];

/** Formato por defecto de un destino antiguo (sin formato elegido), a partir del tipo de la publicación. */
export function defaultFormat(platform: string, mediaKind: string): PostFormat {
  if (platform === "tiktok") return "video";
  if (platform === "youtube") return "short";
  return mediaKind === "reel" || mediaKind === "video" ? "reel" : "post";
}

/** Tipo de la publicación (columna `media_kind`) según sus archivos. */
export function mediaKindFor(files: { mime: string }[]): "image" | "carousel" | "reel" {
  if (files.length > 1) return "carousel";
  return files[0]?.mime.startsWith("video/") ? "reel" : "image";
}

const isVideo = (f: { mime: string }) => f.mime.startsWith("video/");

/** Qué archivo usa cada formato: historia = el primero; reel, vídeo y short = el primer vídeo; post = todos. */
export function filesFor<T extends { mime: string; position: number }>(format: PostFormat, files: T[]): T[] {
  const sorted = [...files].sort((a, b) => a.position - b.position);
  if (format === "post") return sorted.slice(0, 10);
  if (format === "story") return sorted.slice(0, 1);
  const v = sorted.find(isVideo);
  return v ? [v] : [];
}

/** Antes de programar: cada destino tiene lo que necesita. Devuelve el primer problema o null. */
export function checkTargets(targets: { platform: string; format: PostFormat }[], files: { mime: string }[]): string | null {
  if (!targets.length) return "Elige al menos una red";
  if (!files.length) return "Añade al menos una foto o un vídeo";
  const hasVideo = files.some(isVideo);
  for (const t of targets) {
    if (!formatsFor(t.platform).includes(t.format)) return `${platformLabel(t.platform)} no admite «${FORMAT_LABEL[t.format]}»`;
    const needsVideo = t.format === "reel" || t.format === "video" || t.format === "short";
    if (needsVideo && !hasVideo) return `${platformLabel(t.platform)} · ${FORMAT_LABEL[t.format]} necesita un vídeo (MP4 o MOV)`;
  }
  return null;
}

/** Avisos (no impiden programar): lo que cada red hará con los archivos. */
export function targetNotes(targets: { platform: string; format: PostFormat }[], files: { mime: string }[]): string[] {
  const out: string[] = [];
  const has = (p: string, f: PostFormat) => targets.some((t) => t.platform === p && t.format === f);
  if (files.length > 1 && targets.some((t) => t.format === "story")) out.push("Las historias usan solo el primer archivo.");
  if (has("instagram", "story")) out.push("Instagram: una historia en vídeo puede durar hasta 60 s.");
  if (has("youtube", "short")) out.push("YouTube: para que cuente como Short, el vídeo debe ser vertical o cuadrado y durar 3 minutos como mucho.");
  if (has("tiktok", "story")) out.push("TikTok no deja publicar historias desde otras apps: a la hora te aviso con el archivo y el texto listos para subirla tú.");
  return out;
}

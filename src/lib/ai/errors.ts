/**
 * Errores del modelo traducidos a algo útil (lógica pura, con tests). Sobre todo el 429 de Gemini, que llega
 * en cuanto se analizan varios vídeos seguidos: un vídeo de YouTube gasta muchos tokens y el plan gratuito
 * tiene un tope de tokens y de peticiones por minuto (y otro por día).
 */
import { AiError } from "./provider";

/** Espera que sugiere Gemini: `"retryDelay": "37s"` o «Please retry in 37.5s». */
export function parseRetryDelayMs(message: string): number | undefined {
  const m = message.match(/retryDelay\\?"?\s*:\s*\\?"(\d+(?:\.\d+)?)s/) ?? message.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  return m ? Math.ceil(Number(m[1]) * 1000) : undefined;
}

export type RateLimit = { daily: boolean; waitMs: number };

/** ¿Es un límite de uso de Gemini (429 / RESOURCE_EXHAUSTED)? Con la espera que pide (15 s – 10 min; 30 s si no dice; 3 h si es el diario). */
export function rateLimitOf(e: unknown): RateLimit | null {
  if (!(e instanceof Error)) return null;
  const status = e instanceof AiError ? e.status : undefined;
  if (status !== 429 && !/RESOURCE_EXHAUSTED|quota|rate limit|too many requests/i.test(e.message)) return null;
  const daily = /per ?day|PerDay|daily/i.test(e.message);
  const suggested = (e instanceof AiError ? e.retryAfterMs : undefined) ?? parseRetryDelayMs(e.message);
  return { daily, waitMs: daily ? 3 * 60 * 60_000 : suggested === undefined ? 30_000 : Math.min(10 * 60_000, Math.max(15_000, suggested + 2_000)) };
}

/** Mensaje en español para la ficha del vídeo (nunca el texto técnico en inglés). */
export function videoErrorMessage(e: unknown): string {
  const rl = rateLimitOf(e);
  if (rl) return rl.daily
    ? "Gemini ha llegado a su límite diario (plan gratuito). Se reintenta solo más tarde."
    : "Gemini está al límite de vídeos por minuto; se reintenta solo en un momento.";
  const msg = e instanceof Error ? e.message : "";
  const status = e instanceof AiError ? e.status : undefined;
  if (status === 503 || status === 500 || status === 504 || /overloaded|UNAVAILABLE|deadline/i.test(msg)) return "Gemini está saturado ahora mismo. Se reintenta solo en unos minutos.";
  if (/se cortó|MAX_TOKENS/i.test(msg)) return "La respuesta de la IA se cortó. Se reintenta sola.";
  if (status === 400 || status === 403 || status === 404) return "Gemini no ha podido abrir este vídeo (¿privado, con restricción de edad o no disponible?). Puedes reintentar, subir el archivo o usar el análisis ligero.";
  if (status === 401 || /API key/i.test(msg)) return "La clave de Gemini no es válida. Revisa GEMINI_API_KEY en Vercel.";
  return (msg || "Error de IA").slice(0, 300);
}

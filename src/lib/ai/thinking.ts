/**
 * «Pensamiento» mínimo para tareas sencillas (resumir un vídeo): es lo que más tarda en los modelos nuevos.
 * Cada familia lo pide distinto: Gemini 3 con `thinkingLevel`; 2.5 con `thinkingBudget` (Flash admite 0; Pro, mín. 128).
 * Para otros modelos no se envía nada (y si Gemini lo rechazara, el proveedor reintenta sin ello).
 */
export function thinkingConfigFor(model: string): Record<string, unknown> | undefined {
  const m = model.toLowerCase();
  if (/gemini-([3-9]|\d{2,})/.test(m)) return { thinkingLevel: "LOW" };
  if (/gemini-2\.5/.test(m)) return { thinkingBudget: /pro/.test(m) ? 128 : 0 };
  return undefined;
}

/** Fotogramas por segundo según la duración: para resumir sobra con menos, y Gemini responde antes (menos tokens). */
export function videoFps(durationSec: number | null): number | undefined {
  if (durationSec == null || durationSec <= 180) return undefined; // por defecto (1 fps)
  if (durationSec <= 900) return 0.5;
  return 0.25;
}

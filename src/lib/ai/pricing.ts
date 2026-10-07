/**
 * Costes y presupuesto de IA (lógica pura). Todo en micro-euros: 1 € = 1.000.000.
 * Con precios en € por millón de tokens, `tokens × precio` ya sale directamente en micro-euros.
 */
import { addMonths, startOfMonth } from "@/lib/dates";

export type Feature = "classify" | "chat" | "voice" | "video" | "video_light" | "brief" | "news" | "mail";
export type Price = { input: number; output: number }; // € por millón de tokens

/**
 * Precios por defecto. SON ESTIMACIONES: Google los cambia y varían por modelo. Se pueden corregir por
 * modelo en Ajustes → IA (tabla ai_prices). Mejor pecar de caro: el tope de gasto salta antes.
 */
export const DEFAULT_PRICES: { fast: Price; video: Price } = {
  fast: { input: 0.25, output: 1.5 },
  video: { input: 0.6, output: 3.5 },
};

export function costMicros(inputTokens: number, outputTokens: number, price: Price): number {
  return Math.ceil(inputTokens * price.input + outputTokens * price.output);
}

/** Tokens aproximados de un vídeo (audio + fotogramas a resolución por defecto: ~300 por segundo). */
export const VIDEO_TOKENS_PER_SECOND = 300;

export function estimateVideoCostMicros(durationSec: number, price: Price, outputTokens = 1500): number {
  return costMicros(Math.round(durationSec * VIDEO_TOKENS_PER_SECOND) + 500, outputTokens, price);
}

export const microsToEuros = (m: number) => m / 1_000_000;
export const eurosToMicros = (e: number) => Math.round(e * 1_000_000);

export type BudgetState = {
  spentMicros: number;
  budgetMicros: number;
  remainingMicros: number;
  pct: number;                 // sin límite superior (puede pasar de 100)
  level: "ok" | "warn" | "blocked";
};

/** Presupuesto en céntimos (profiles.ai_monthly_budget_cents). Aviso desde el 80 %, bloqueo al 100 %. */
export function budgetState(spentMicros: number, budgetCents: number): BudgetState {
  const budgetMicros = budgetCents * 10_000;
  const pct = budgetMicros > 0 ? (spentMicros / budgetMicros) * 100 : 100;
  return {
    spentMicros, budgetMicros, remainingMicros: Math.max(0, budgetMicros - spentMicros), pct,
    level: budgetMicros <= 0 || spentMicros >= budgetMicros ? "blocked" : pct >= 80 ? "warn" : "ok",
  };
}

/** Mensaje para la persona cuando la IA está bloqueada. */
export const BLOCKED_MESSAGE = "Has llegado al presupuesto de IA de este mes. La captura sigue funcionando sin IA; se reactiva el mes que viene (o sube el límite en Ajustes → IA).";

/** Mes natural (AAAA-MM) de una fecha local y sus límites [inicio, siguiente inicio) como fechas locales. */
export function monthBounds(localDate: string): { key: string; from: string; to: string } {
  const from = startOfMonth(localDate);
  return { key: from.slice(0, 7), from, to: addMonths(from, 1) };
}

/** ¿Se permite la llamada? Además del bloqueo, evita pasarse con una llamada cara conocida (vídeos largos). */
export function canSpend(state: BudgetState, estimatedMicros = 0): { ok: true } | { ok: false; reason: "blocked" | "would_exceed" } {
  if (state.level === "blocked") return { ok: false, reason: "blocked" };
  if (estimatedMicros > state.remainingMicros) return { ok: false, reason: "would_exceed" };
  return { ok: true };
}

import { describe, expect, it } from "vitest";
import { parseRetryDelayMs, rateLimitOf, videoErrorMessage } from "./errors";
import { AiError } from "./provider";

// Texto real (resumido) de un 429 de Gemini tal como lo da el SDK.
const perMinute = `got status: 429 Too Many Requests. {"error":{"code":429,"message":"You exceeded your current quota. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count, limit: 250000. Please retry in 37.06s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaId":"GenerateContentInputTokensPerModelPerMinute-FreeTier"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"37s"}]}}`;

describe("errores de Gemini", () => {
  it("lee la espera sugerida", () => {
    expect(parseRetryDelayMs(perMinute)).toBe(37_000);
    expect(parseRetryDelayMs("Please retry in 2.5s.")).toBe(2_500);
    expect(parseRetryDelayMs("otra cosa")).toBeUndefined();
  });

  it("429 por minuto: vuelve a la cola con la espera de Gemini (mín. 15 s)", () => {
    expect(rateLimitOf(new AiError(perMinute.slice(0, 280), 429, true, 37_000))).toEqual({ daily: false, waitMs: 39_000 });
    expect(rateLimitOf(new AiError("x", 429, true, 3_000))).toEqual({ daily: false, waitMs: 15_000 });
    expect(rateLimitOf(new AiError("x", 429, true))).toEqual({ daily: false, waitMs: 30_000 });
  });

  it("429 diario: espera horas", () => {
    expect(rateLimitOf(new AiError("quota exceeded [PerDay]", 429, true))?.daily).toBe(true);
  });

  it("otros errores no son límite", () => {
    expect(rateLimitOf(new AiError("bad", 400))).toBeNull();
    expect(rateLimitOf(new Error("La IA no devolvió un análisis válido"))).toBeNull();
    expect(rateLimitOf("x")).toBeNull();
  });

  it("mensajes en español para la ficha", () => {
    expect(videoErrorMessage(new AiError(perMinute, 429, true))).toMatch(/límite de vídeos por minuto/);
    expect(videoErrorMessage(new AiError("x [PerDay]", 429, true))).toMatch(/límite diario/);
    expect(videoErrorMessage(new AiError("The model is overloaded", 503, true))).toMatch(/saturado/);
    expect(videoErrorMessage(new AiError("Request contains an invalid argument.", 400))).toMatch(/no ha podido abrir este vídeo/);
    expect(videoErrorMessage(new AiError("La respuesta de la IA se cortó (MAX_TOKENS)", undefined, true))).toMatch(/se cortó/);
    expect(videoErrorMessage(new Error("No se encontró el vídeo subido. Vuelve a subirlo."))).toBe("No se encontró el vídeo subido. Vuelve a subirlo.");
  });
});

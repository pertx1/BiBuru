import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import { AiError, isRetryableStatus, type AiProvider, type AiRequest, type AiResponse, type Content } from "./provider";

export type ModelNames = { fast: string; video: string };

/** Modelos desde variables de entorno (nunca fijos en el código). */
export function getModelNames(): ModelNames {
  return {
    fast: process.env.GEMINI_MODEL_FAST?.trim() || "gemini-3.5-flash-lite",
    video: process.env.GEMINI_MODEL_VIDEO?.trim() || "gemini-3.8-flash",
  };
}

export const hasGeminiKey = () => !!process.env.GEMINI_API_KEY;

/** Proveedor real con el SDK oficial `@google/genai`. La clave solo vive en el servidor. */
export function geminiProvider(): AiProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiError("Falta GEMINI_API_KEY en el servidor", undefined, false);
  const ai = new GoogleGenAI({ apiKey });

  return {
    async generate(req: AiRequest): Promise<AiResponse> {
      try {
        const res = await ai.models.generateContent({
          model: req.model,
          contents: req.contents as never,
          config: {
            systemInstruction: req.system,
            temperature: req.temperature ?? 0.2,
            maxOutputTokens: req.maxOutputTokens,
            ...(req.jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: req.jsonSchema } : {}),
            ...(req.tools?.length ? { tools: [{ functionDeclarations: req.tools as never }] } : {}),
          },
        });
        const calls = (res.functionCalls ?? []).map((c) => ({ name: c.name ?? "", args: (c.args ?? {}) as Record<string, unknown> }));
        const parts = res.candidates?.[0]?.content?.parts ?? [];
        const text = parts.map((p) => p.text ?? "").join("");
        const u = res.usageMetadata;
        return {
          text,
          calls,
          content: { role: "model", parts: parts as unknown as Content["parts"] },
          // Los tokens de «pensamiento» se facturan como salida.
          usage: { inputTokens: u?.promptTokenCount ?? 0, outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0) },
        };
      } catch (e) {
        const status = e instanceof ApiError ? e.status : (e as { status?: number }).status;
        throw new AiError(e instanceof Error ? e.message.slice(0, 300) : "Error de IA", status, isRetryableStatus(status));
      }
    },
  };
}

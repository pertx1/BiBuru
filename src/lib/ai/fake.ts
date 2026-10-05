import type { AiProvider, AiRequest, AiResponse } from "./provider";

/** Proveedor falso para pruebas: devuelve respuestas guiadas y registra las peticiones. */
export function fakeProvider(script: (req: AiRequest, n: number) => Partial<AiResponse> | Error): AiProvider & { requests: AiRequest[] } {
  const requests: AiRequest[] = [];
  return {
    requests,
    async generate(req) {
      requests.push(req);
      const out = script(req, requests.length);
      if (out instanceof Error) throw out;
      return { text: "", calls: [], content: { role: "model", parts: out.text ? [{ text: out.text }] : [] }, usage: { inputTokens: 100, outputTokens: 50 }, ...out };
    },
  };
}

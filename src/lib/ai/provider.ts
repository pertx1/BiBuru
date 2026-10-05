/** Contrato mínimo con el modelo. Permite cambiar de proveedor y probar todo con un falso sin gastar un euro. */
export type Part = {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  fileData?: { fileUri: string; mimeType?: string };
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
};
export type Content = { role: "user" | "model"; parts: Part[] };

export type FunctionDecl = { name: string; description: string; parametersJsonSchema: unknown };

export type AiRequest = {
  model: string;
  system?: string;
  contents: Content[];
  jsonSchema?: unknown;       // respuesta JSON validada por este esquema
  tools?: FunctionDecl[];
  temperature?: number;
  maxOutputTokens?: number;
};

export type AiResponse = {
  text: string;
  calls: { name: string; args: Record<string, unknown> }[];
  content: Content;           // lo que dijo el modelo, para continuar un bucle de herramientas
  usage: { inputTokens: number; outputTokens: number };
};

export interface AiProvider {
  generate(req: AiRequest): Promise<AiResponse>;
}

export class AiError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) {
    super(message);
  }
}

/** Errores que merecen reintento con espera: límite de peticiones (429), sobrecarga (503) y fallos del servidor. */
export const isRetryableStatus = (s?: number) => s === 429 || s === 503 || s === 500 || s === 504;

/**
 * Servidor MCP mínimo (JSON-RPC 2.0 sobre «Streamable HTTP», sin estado y sin SDK) para conectar BiBuru a Claude
 * (claude.ai, la app y Claude Code). Lógica pura: recibe el cuerpo ya leído y la lista de herramientas; con tests.
 * Solo respuestas JSON (sin SSE): el cliente pide `application/json, text/event-stream` y acepta cualquiera.
 */
import { z } from "zod";

export const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const SERVER_INFO = { name: "BiBuru", version: "1.0.0" };

export type ToolResult = { text: string; isError?: boolean };
export type McpTool<C> = {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject;
  readOnly?: boolean;
  run: (ctx: C, args: never) => Promise<ToolResult | string>;
};
/** Ayuda de tipos: el `run` recibe los argumentos ya validados por su esquema. */
export function tool<C, S extends z.ZodObject>(t: { name: string; title: string; description: string; input: S; readOnly?: boolean; run: (ctx: C, args: z.infer<S>) => Promise<ToolResult | string> }): McpTool<C> {
  return t as unknown as McpTool<C>;
}

type Id = string | number | null;
type Rpc = { jsonrpc?: unknown; id?: Id; method?: unknown; params?: unknown };
export type RpcResponse = { jsonrpc: "2.0"; id: Id; result?: unknown; error?: { code: number; message: string } };

/** Error que se le enseña a Claude tal cual (dato que falta, tarea que no existe…). El resto se registra y se resume. */
export class ToolError extends Error {}

const ok = (id: Id, result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result });
const err = (id: Id, code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

/** Primer error de Zod en español corto («fecha: …»). */
function zodMessage(e: z.ZodError): string {
  const i = e.issues[0];
  return i ? `${i.path.join(".") || "argumentos"}: ${i.message}` : "Argumentos no válidos";
}

export function toolList<C>(tools: McpTool<C>[]) {
  return tools.map((t) => {
    const { $schema: _drop, ...schema } = z.toJSONSchema(t.input) as Record<string, unknown>;
    void _drop;
    return { name: t.name, title: t.title, description: t.description, inputSchema: schema, annotations: { title: t.title, readOnlyHint: !!t.readOnly, destructiveHint: false } };
  });
}

async function handleOne<C>(msg: Rpc, tools: McpTool<C>[], ctx: C, instructions: string, log: (e: unknown) => void): Promise<RpcResponse | null> {
  const id: Id = typeof msg.id === "string" || typeof msg.id === "number" ? msg.id : null;
  const isNotification = !("id" in msg) || msg.id === undefined;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return isNotification ? null : err(id, -32600, "Petición no válida");
  if (msg.method.startsWith("notifications/")) return null;
  const params = (msg.params && typeof msg.params === "object" ? msg.params : {}) as Record<string, unknown>;
  switch (msg.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const version = (SUPPORTED_VERSIONS as readonly string[]).includes(asked) ? asked : SUPPORTED_VERSIONS[0];
      return ok(id, { protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions });
    }
    case "ping": return ok(id, {});
    case "tools/list": return ok(id, { tools: toolList(tools) });
    case "resources/list": return ok(id, { resources: [] });
    case "prompts/list": return ok(id, { prompts: [] });
    case "tools/call": {
      const t = tools.find((x) => x.name === params.name);
      if (!t) return err(id, -32602, `Herramienta desconocida: ${String(params.name)}`);
      const parsed = t.input.safeParse(params.arguments ?? {});
      if (!parsed.success) return ok(id, { content: [{ type: "text", text: `Datos no válidos — ${zodMessage(parsed.error)}` }], isError: true });
      try {
        const r = await t.run(ctx, parsed.data as never);
        const res = typeof r === "string" ? { text: r } : r;
        return ok(id, { content: [{ type: "text", text: res.text }], isError: !!res.isError });
      } catch (e) {
        if (!(e instanceof ToolError)) log(e);
        return ok(id, { content: [{ type: "text", text: e instanceof ToolError ? e.message : "BiBuru no ha podido hacerlo ahora mismo. Prueba otra vez en un momento." }], isError: true });
      }
    }
    default: return isNotification ? null : err(id, -32601, `Método no disponible: ${msg.method}`);
  }
}

/** Procesa un mensaje o un lote. `null` = solo notificaciones (se responde 202 sin cuerpo). */
export async function handleRpc<C>(body: unknown, tools: McpTool<C>[], ctx: C, instructions: string, log: (e: unknown) => void = () => {}): Promise<RpcResponse | RpcResponse[] | null> {
  if (Array.isArray(body)) {
    if (!body.length) return err(null, -32600, "Lote vacío");
    const out = (await Promise.all(body.map((m) => handleOne(m as Rpc, tools, ctx, instructions, log)))).filter((r): r is RpcResponse => !!r);
    return out.length ? out : null;
  }
  if (!body || typeof body !== "object") return err(null, -32700, "JSON no válido");
  return handleOne(body as Rpc, tools, ctx, instructions, log);
}

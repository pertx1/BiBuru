import { describe, expect, it } from "vitest";
import { z } from "zod";
import { handleRpc, tool, ToolError, toolList } from "./protocol";

const tools = [
  tool<{ n: number }, z.ZodObject<{ titulo: z.ZodString }>>({
    name: "eco", title: "Eco", description: "Devuelve el título", input: z.object({ titulo: z.string().min(1) }),
    async run(ctx, a) { return `${a.titulo} ${ctx.n}`; },
  }),
  tool({ name: "falla", title: "Falla", description: "x", input: z.object({}), async run() { throw new ToolError("No existe esa tarea"); } }),
  tool({ name: "explota", title: "Explota", description: "x", input: z.object({}), async run() { throw new Error("secreto interno"); } }),
];
const call = (body: unknown, log?: (e: unknown) => void) => handleRpc(body, tools, { n: 7 }, "Instrucciones", log);

describe("servidor MCP", () => {
  it("initialize devuelve la versión pedida si se admite, herramientas e instrucciones", async () => {
    const r = await call({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "claude-ai" } } });
    expect(r).toMatchObject({ id: 1, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "BiBuru" }, instructions: "Instrucciones" } });
    const r2 = await call({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2099-01-01" } });
    expect(r2).toMatchObject({ result: { protocolVersion: "2025-06-18" } });
  });

  it("las notificaciones no tienen respuesta (202)", async () => {
    expect(await call({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect(await call([{ jsonrpc: "2.0", method: "notifications/initialized" }])).toBeNull();
  });

  it("tools/list con esquema JSON sin $schema", async () => {
    const r = await call({ jsonrpc: "2.0", id: "a", method: "tools/list" });
    const list = (r as { result: { tools: ReturnType<typeof toolList> } }).result.tools;
    expect(list.map((t) => t.name)).toEqual(["eco", "falla", "explota"]);
    expect(list[0].inputSchema).toMatchObject({ type: "object", required: ["titulo"] });
    expect(list[0].inputSchema).not.toHaveProperty("$schema");
  });

  it("tools/call valida los argumentos y ejecuta con el contexto", async () => {
    expect(await call({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "eco", arguments: { titulo: "Hola" } } }))
      .toEqual({ jsonrpc: "2.0", id: 3, result: { content: [{ type: "text", text: "Hola 7" }], isError: false } });
    const bad = await call({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "eco", arguments: { titulo: "" } } });
    expect(bad).toMatchObject({ result: { isError: true } });
    expect(JSON.stringify(bad)).toContain("titulo");
  });

  it("los errores de herramienta se devuelven como resultado; los internos no enseñan el detalle", async () => {
    const logged: unknown[] = [];
    expect(await call({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "falla" } }, (e) => logged.push(e)))
      .toMatchObject({ result: { isError: true, content: [{ text: "No existe esa tarea" }] } });
    const r = await call({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "explota" } }, (e) => logged.push(e));
    expect(JSON.stringify(r)).not.toContain("secreto");
    expect(logged).toHaveLength(1);
  });

  it("métodos y herramientas desconocidos, peticiones mal formadas y lotes", async () => {
    expect(await call({ jsonrpc: "2.0", id: 7, method: "nada" })).toMatchObject({ error: { code: -32601 } });
    expect(await call({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "otra" } })).toMatchObject({ error: { code: -32602 } });
    expect(await call({ id: 9, method: "ping" })).toMatchObject({ error: { code: -32600 } });
    expect(await call("x")).toMatchObject({ error: { code: -32700 } });
    expect(await call([{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", method: "notifications/x" }])).toEqual([{ jsonrpc: "2.0", id: 1, result: {} }]);
  });
});

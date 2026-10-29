import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleRpc } from "./protocol";
import { MCP_INSTRUCTIONS, MCP_TOOLS, mcpContext } from "./tools";

/**
 * Punto de entrada HTTP del conector de Claude (MCP, «Streamable HTTP» sin estado). Público para el proxy de
 * sesión, pero exige la clave personal: en la dirección (`/api/mcp/<clave>`, lo que pide claude.ai) o en
 * `Authorization: Bearer` (Claude Code con `--header`).
 */
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });

function origin(request: NextRequest): string {
  const h = request.headers;
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost"}`;
}

export async function mcpPost(request: NextRequest, pathToken: string | null): Promise<NextResponse> {
  if (Number(request.headers.get("content-length") ?? 0) > 200_000) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Petición demasiado grande" } }, 413);
  const token = pathToken ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  let body: unknown;
  try { body = await request.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON no válido" } }, 400); }
  const ctx = await mcpContext(createAdminClient(), token, origin(request), request.headers.get("user-agent")).catch((e) => { console.error("[mcp] clave:", e instanceof Error ? e.message : e); return null; });
  if (!ctx) return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Clave de BiBuru no válida: crea otra en BiBuru → Ajustes → Conectar Claude." } }, 401);
  const out = await handleRpc(body, MCP_TOOLS, ctx, MCP_INSTRUCTIONS, (e) => console.error("[mcp] herramienta:", e instanceof Error ? e.message : e));
  return out === null ? new NextResponse(null, { status: 202 }) : json(out);
}

/** Sin flujo SSE del servidor ni sesiones: GET/DELETE no se usan (lo indica la especificación con 405). */
export const mcpNotAllowed = () => new NextResponse(null, { status: 405, headers: { Allow: "POST" } });

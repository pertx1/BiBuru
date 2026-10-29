import type { NextRequest } from "next/server";
import { mcpNotAllowed, mcpPost } from "@/lib/mcp/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Conector de Claude con la clave en `Authorization: Bearer` (Claude Code: `claude mcp add … --header`). */
export async function POST(request: NextRequest) {
  return mcpPost(request, null);
}
export const GET = mcpNotAllowed;
export const DELETE = mcpNotAllowed;

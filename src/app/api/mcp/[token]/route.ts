import type { NextRequest } from "next/server";
import { mcpNotAllowed, mcpPost } from "@/lib/mcp/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // guardar_video sigue analizando en segundo plano (after)

/** Conector de Claude con la clave en la dirección (claude.ai → Conectores → Añadir conector personalizado). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return mcpPost(request, (await params).token);
}
export const GET = mcpNotAllowed;
export const DELETE = mcpNotAllowed;

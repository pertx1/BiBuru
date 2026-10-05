import { NextResponse, type NextRequest } from "next/server";
import { hasGeminiKey } from "@/lib/ai/gemini";
import { checkCron } from "@/lib/cron-auth";
import { processVideoQueue } from "@/lib/favorites/service";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cola de análisis de vídeos (cada pocos minutos): hasta 3 por pasada, con reintentos y presupuesto. */
async function handle(request: NextRequest) {
  const denied = checkCron(request);
  if (denied) return denied;
  if (!hasGeminiKey()) return NextResponse.json({ ok: true, skipped: "sin GEMINI_API_KEY" });
  try {
    return NextResponse.json({ ok: true, ...(await processVideoQueue(createAdminClient())) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron] videos:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error al procesar la cola de vídeos" }, { status: 500 });
  }
}
export const POST = handle;
export const GET = handle;

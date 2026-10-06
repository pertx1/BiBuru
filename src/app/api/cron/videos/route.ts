import { NextResponse, type NextRequest } from "next/server";
import { hasGeminiKey } from "@/lib/ai/gemini";
import { checkCron } from "@/lib/cron-auth";
import { processVideoQueue, syncStaleFeeds } from "@/lib/favorites/service";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cada pocos minutos: (1) mira las listas de YouTube por RSS que lleven más de una hora sin revisar (máx. 5 por pasada)
 * y (2) analiza la cola de vídeos: hasta 3 por pasada, con reintentos y presupuesto.
 */
async function handle(request: NextRequest) {
  const denied = checkCron(request);
  if (denied) return denied;
  try {
    const admin = createAdminClient();
    const feeds = await syncStaleFeeds(admin);
    if (!hasGeminiKey()) return NextResponse.json({ ok: true, feeds, skipped: "sin GEMINI_API_KEY" });
    return NextResponse.json({ ok: true, feeds, ...(await processVideoQueue(admin)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron] videos:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error al procesar la cola de vídeos" }, { status: 500 });
  }
}
export const POST = handle;
export const GET = handle;

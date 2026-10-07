import { NextResponse, type NextRequest } from "next/server";
import { checkCron } from "@/lib/cron-auth";
import "@/lib/social/tiktok-service"; // registra TikTok en el servicio común
import { runSocialCron } from "@/lib/social/service";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cada 5 min: publica lo programado (con reintentos), foto diaria de estadísticas, renovación de tokens y limpieza de archivos. */
async function handle(request: NextRequest) {
  const denied = checkCron(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ done: true, ...(await runSocialCron(createAdminClient())) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron] social:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error en redes" }, { status: 500 });
  }
}
export const POST = handle;
export const GET = handle;

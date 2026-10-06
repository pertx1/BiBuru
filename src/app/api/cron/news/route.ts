import { NextResponse, type NextRequest } from "next/server";
import { checkCron } from "@/lib/cron-auth";
import { runNewsCron } from "@/lib/news/service";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Noticias (cada 15 min): recoge fuentes pendientes y genera el resumen del día a quien le toque. El aviso lo envía /api/cron/reminders. */
async function handle(request: NextRequest) {
  const denied = checkCron(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ ok: true, ...(await runNewsCron(createAdminClient())) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron] news:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error en las noticias" }, { status: 500 });
  }
}
export const POST = handle;
export const GET = handle;

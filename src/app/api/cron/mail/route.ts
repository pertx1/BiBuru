import { NextResponse, type NextRequest } from "next/server";
import { checkCron } from "@/lib/cron-auth";
import { microsoftConfig } from "@/lib/mail/graph";
import { syncDueMailAccounts } from "@/lib/mail/service";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cada 10 min: sincroniza (delta) las cuentas de Outlook que lleven más de 8 min sin mirar. Sin claves de Microsoft, no hace nada. */
async function handle(request: NextRequest) {
  const denied = checkCron(request);
  if (denied) return denied;
  if (!microsoftConfig()) return NextResponse.json({ ok: true, skipped: "sin MICROSOFT_CLIENT_ID" });
  try {
    return NextResponse.json({ done: true, ...(await syncDueMailAccounts(createAdminClient())) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron] mail:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error al sincronizar el correo" }, { status: 500 });
  }
}
export const POST = handle;
export const GET = handle;

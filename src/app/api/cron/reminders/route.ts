import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runReminders } from "@/lib/notifications/cron";
import { webPushSender } from "@/lib/notifications/push";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Comparación en tiempo constante del secreto del cron. */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 20) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return timingSafeEqual(digest(given), digest(secret));
}

async function handle(request: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET sin configurar" }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const summary = await runReminders(createAdminClient(), webPushSender());
    return NextResponse.json({ ok: true, ...summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron] reminders:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error al procesar los avisos" }, { status: 500 });
  }
}

// POST lo usa Supabase Cron (pg_net); GET permite configurarlo también desde cron-job.org.
export const POST = handle;
export const GET = handle;

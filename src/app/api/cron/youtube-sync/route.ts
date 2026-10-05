import { NextResponse, type NextRequest } from "next/server";
import { checkCron } from "@/lib/cron-auth";
import { syncYoutube } from "@/lib/favorites/service";
import { googleConfig } from "@/lib/favorites/youtube";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sincroniza «Me gusta» y listas de YouTube de cada cuenta conectada (cada 6 horas). */
async function handle(request: NextRequest) {
  const denied = checkCron(request);
  if (denied) return denied;
  if (!googleConfig() || !process.env.TOKEN_ENCRYPTION_KEY) return NextResponse.json({ ok: true, skipped: "Google sin configurar" });
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("integrations").select("user_id, workspace_id, sync_likes, sync_playlists, last_sync_at").eq("provider", "google").limit(20);
    let added = 0, errors = 0;
    for (const i of data ?? []) {
      const r = await syncYoutube(admin, i);
      added += r.added;
      if (r.error) errors++;
    }
    return NextResponse.json({ ok: true, accounts: data?.length ?? 0, added, errors }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron] youtube-sync:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error al sincronizar" }, { status: 500 });
  }
}
export const POST = handle;
export const GET = handle;

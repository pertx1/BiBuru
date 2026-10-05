import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { geminiProvider, getModelNames, hasGeminiKey } from "@/lib/ai/gemini";
import { classifyInboxItem } from "@/lib/ai/inbox";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const digest = (s: string) => createHash("sha256").update(s).digest();
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 20) return false;
  return timingSafeEqual(digest(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""), digest(secret));
}

/**
 * Cola de IA (cada minuto): clasifica las capturas que quedaron pendientes (sin conexión, error de IA, presupuesto
 * agotado y repuesto…) respetando el límite de peticiones por minuto. Máximo 5 por pasada.
 */
async function handle(request: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET sin configurar" }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!hasGeminiKey()) return NextResponse.json({ ok: true, skipped: "sin GEMINI_API_KEY" });
  try {
    const admin = createAdminClient();
    const now = new Date();
    const { data: items } = await admin.from("inbox_items").select("id, user_id, workspace_id, created_at, ai_next_try_at, ai_attempts")
      .eq("status", "pending").or(`ai_next_try_at.lte.${now.toISOString()},and(ai_next_try_at.is.null,ai_attempts.eq.0,created_at.lt.${new Date(now.getTime() - 90_000).toISOString()})`)
      .order("created_at").limit(5);
    const out = { processed: 0, proposed: 0, applied: 0, retry: 0, blocked: 0 };
    const provider = geminiProvider();
    const models = getModelNames();
    for (const it of items ?? []) {
      const { data: p } = await admin.from("profiles").select("timezone, ai_monthly_budget_cents, ai_auto_apply").eq("user_id", it.user_id).maybeSingle();
      if (!p) continue;
      const r = await classifyInboxItem({ supabase: admin, workspaceId: it.workspace_id, userId: it.user_id, timezone: p.timezone, budgetCents: p.ai_monthly_budget_cents, autoApply: p.ai_auto_apply, provider, models }, it.id);
      out.processed++;
      if (r === "proposed" || r === "applied" || r === "retry" || r === "blocked") out[r]++;
    }
    return NextResponse.json({ ok: true, ...out }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron] ai:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error al procesar la cola de IA" }, { status: 500 });
  }
}
export const POST = handle;
export const GET = handle;

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/context";
import { encryptSecret } from "@/lib/favorites/crypto";
import { exchangeCode } from "@/lib/favorites/youtube";
import { YT_SCOPES, YtError, ytChannel, ytRedirectUri } from "@/lib/social/youtube";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const sameState = (a: string | undefined, b: string | null) => !!a && !!b && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Vuelta de Google: tokens CIFRADOS y el canal de YouTube como cuenta de Redes (para publicar Shorts). */
export async function GET(request: NextRequest) {
  const { userId, workspaceId } = await getContext();
  const back = (q: string) => {
    const r = NextResponse.redirect(new URL(`/redes?youtube=${q}`, request.nextUrl.origin));
    r.cookies.delete({ name: "yt_oauth_state", path: "/api/youtube" });
    return r;
  };
  const p = request.nextUrl.searchParams;
  if (p.get("error")) return back("cancelado");
  if (!sameState(request.cookies.get("yt_oauth_state")?.value, p.get("state"))) return back("estado");
  const code = p.get("code");
  if (!code) return back("error");
  try {
    const t = await exchangeCode(code, ytRedirectUri(request.nextUrl.origin));
    if (!t.refreshToken) return back("error"); // sin token de renovación no se puede publicar a la hora programada
    if (!t.scope.includes(YT_SCOPES[0])) return back("permisos");
    const ch = await ytChannel(t.accessToken);
    const admin = createAdminClient();
    const { error } = await admin.from("social_accounts").upsert({
      workspace_id: workspaceId, user_id: userId, platform: "youtube", external_id: ch.id, username: ch.handle ?? ch.title, display_name: ch.title,
      avatar_url: ch.avatar?.startsWith("https://") ? ch.avatar.slice(0, 2000) : null, account_type: "CHANNEL", followers_count: ch.subscribers,
      access_token_enc: encryptSecret(t.accessToken), refresh_token_enc: encryptSecret(t.refreshToken), token_expires_at: new Date(Date.now() + 3300_000).toISOString(),
      refresh_expires_at: null, scopes: t.scope.slice(0, 1000), status: "ok", last_error: null,
    }, { onConflict: "workspace_id,platform,external_id" });
    if (error) { console.error("[youtube] guardar:", error.message); return back("error"); }
    return back("ok");
  } catch (e) {
    console.error("[youtube] callback:", e instanceof Error ? e.message : e);
    return back(e instanceof YtError && e.status === 404 ? "sin-canal" : "error");
  }
}

import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/context";
import { encryptSecret } from "@/lib/favorites/crypto";
import "@/lib/social/tiktok-service";
import { snapshotAccount } from "@/lib/social/service";
import { ttExchangeCode, ttProfile, ttRedirectUri } from "@/lib/social/tiktok";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const sameState = (a: string | undefined, b: string | null) => !!a && !!b && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Vuelta de TikTok: guarda los tokens CIFRADOS (acceso 24 h + renovación 365 días). Varias cuentas, cada una a un negocio. */
export async function GET(request: NextRequest) {
  const { userId, workspaceId } = await getContext();
  const back = (q: string) => {
    const r = NextResponse.redirect(new URL(`/redes?tiktok=${q}`, request.nextUrl.origin));
    r.cookies.delete({ name: "tt_oauth_state", path: "/api/tiktok" });
    return r;
  };
  const p = request.nextUrl.searchParams;
  if (p.get("error")) return back("cancelado");
  if (!sameState(request.cookies.get("tt_oauth_state")?.value, p.get("state"))) return back("estado");
  const code = p.get("code");
  if (!code) return back("error");
  try {
    const t = await ttExchangeCode(code, ttRedirectUri(request.nextUrl.origin));
    const prof = await ttProfile(t.accessToken);
    const now = Date.now();
    const admin = createAdminClient();
    const { data, error } = await admin.from("social_accounts").upsert({
      workspace_id: workspaceId, user_id: userId, platform: "tiktok", external_id: t.openId || prof.openId, username: prof.username, display_name: prof.name,
      avatar_url: prof.avatar?.startsWith("https://") ? prof.avatar.slice(0, 2000) : null, access_token_enc: encryptSecret(t.accessToken), refresh_token_enc: encryptSecret(t.refreshToken),
      token_expires_at: new Date(now + t.expiresIn * 1000).toISOString(), refresh_expires_at: new Date(now + t.refreshExpiresIn * 1000).toISOString(), scopes: t.scope.slice(0, 1000), status: "ok", last_error: null,
    }, { onConflict: "workspace_id,platform,external_id" }).select("id, workspace_id, user_id, platform, external_id, access_token_enc, refresh_token_enc, token_expires_at, refresh_expires_at, status, last_snapshot_on, created_at, updated_at").single();
    if (error) { console.error("[tiktok] guardar:", error.message); return back("error"); }
    after(() => snapshotAccount(createAdminClient(), data).catch(() => null));
    return back("ok");
  } catch (e) {
    console.error("[tiktok] callback:", e instanceof Error ? e.message : e);
    return back("error");
  }
}

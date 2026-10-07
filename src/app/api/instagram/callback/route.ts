import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/context";
import { encryptSecret } from "@/lib/favorites/crypto";
import { IG_NO_LINKED_ACCOUNT, igExchangeCode, igProfile, igRedirectUri } from "@/lib/social/instagram";
import { snapshotAccount } from "@/lib/social/service";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const sameState = (a: string | undefined, b: string | null) => !!a && !!b && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Vuelta de Instagram: token largo (60 días) CIFRADO. Se pueden conectar varias cuentas, cada una a un negocio. */
export async function GET(request: NextRequest) {
  const { userId, workspaceId } = await getContext();
  const back = (q: string) => {
    const r = NextResponse.redirect(new URL(`/redes?instagram=${q}`, request.nextUrl.origin));
    r.cookies.delete({ name: "ig_oauth_state", path: "/api/instagram" });
    return r;
  };
  const p = request.nextUrl.searchParams;
  if (p.get("error")) return back("cancelado");
  if (!sameState(request.cookies.get("ig_oauth_state")?.value, p.get("state"))) return back("estado");
  const code = p.get("code");
  if (!code) return back("error");
  try {
    const t = await igExchangeCode(code, igRedirectUri(request.nextUrl.origin));
    const prof = await igProfile(t.accessToken);
    const admin = createAdminClient();
    const { data, error } = await admin.from("social_accounts").upsert({
      workspace_id: workspaceId, user_id: userId, platform: "instagram", external_id: prof.id, username: prof.username, display_name: prof.name,
      avatar_url: prof.avatar?.startsWith("https://") ? prof.avatar.slice(0, 2000) : null, account_type: prof.accountType, access_token_enc: encryptSecret(t.accessToken),
      token_expires_at: new Date(Date.now() + t.expiresIn * 1000).toISOString(), scopes: t.scopes.slice(0, 1000), status: "ok", last_error: null,
    }, { onConflict: "workspace_id,platform,external_id" }).select("id, workspace_id, user_id, platform, external_id, access_token_enc, refresh_token_enc, token_expires_at, refresh_expires_at, status, last_snapshot_on, created_at, updated_at").single();
    if (error) { console.error("[instagram] guardar:", error.message); return back("error"); }
    after(() => snapshotAccount(createAdminClient(), data).catch(() => null)); // primeras estadísticas
    return back("ok");
  } catch (e) {
    console.error("[instagram] callback:", e instanceof Error ? e.message : e);
    return back(e instanceof Error && e.message === IG_NO_LINKED_ACCOUNT ? "sin-pagina" : "error");
  }
}

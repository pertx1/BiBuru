import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/context";
import { encryptSecret } from "@/lib/favorites/crypto";
import { accountEmail, exchangeCode, GOOGLE_SCOPES, redirectUriFor } from "@/lib/favorites/youtube";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function sameState(a: string | undefined, b: string | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Vuelta de Google: comprueba el `state`, cambia el código por el token y lo guarda CIFRADO (nunca en claro). */
export async function GET(request: NextRequest) {
  const { userId, workspaceId } = await getContext();
  const back = (q: string) => {
    const r = NextResponse.redirect(new URL(`/ajustes?google=${q}#youtube`, request.nextUrl.origin));
    r.cookies.delete({ name: "google_oauth_state", path: "/api/google" });
    return r;
  };
  const p = request.nextUrl.searchParams;
  if (p.get("error")) return back("cancelado");
  if (!sameState(request.cookies.get("google_oauth_state")?.value, p.get("state"))) return back("estado");
  const code = p.get("code");
  if (!code) return back("error");
  try {
    const t = await exchangeCode(code, redirectUriFor(request.nextUrl.origin));
    if (!t.refreshToken) return back("sin-token"); // Google no devolvió refresh token: hay que reconectar
    if (!GOOGLE_SCOPES.slice(0, 1).every((s) => t.scope.includes(s))) return back("permisos");
    const email = await accountEmail(t.accessToken);
    const admin = createAdminClient();
    const { error } = await admin.from("integrations").upsert(
      { user_id: userId, workspace_id: workspaceId, provider: "google", account_email: email, refresh_token_enc: encryptSecret(t.refreshToken), scopes: t.scope.slice(0, 500), last_sync_error: null },
      { onConflict: "user_id,provider" },
    );
    if (error) { console.error("[google] guardar:", error.message); return back("error"); }
    return back("ok");
  } catch (e) {
    console.error("[google] callback:", e instanceof Error ? e.message : e);
    return back("error");
  }
}

import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/context";
import { encryptSecret } from "@/lib/favorites/crypto";
import { exchangeMsCode, msMe, msRedirectUri } from "@/lib/mail/graph";
import { syncDueMailAccounts } from "@/lib/mail/service";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const sameState = (a: string | undefined, b: string | null) => !!a && !!b && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Vuelta de Microsoft: comprueba el `state`, cambia el código por el token y lo guarda CIFRADO. Permite varias cuentas. */
export async function GET(request: NextRequest) {
  const { userId, workspaceId } = await getContext();
  const back = (q: string) => {
    const r = NextResponse.redirect(new URL(`/ajustes?outlook=${q}#correo`, request.nextUrl.origin));
    r.cookies.delete({ name: "ms_oauth_state", path: "/api/outlook" });
    return r;
  };
  const p = request.nextUrl.searchParams;
  if (p.get("error")) return back(p.get("error") === "access_denied" ? "cancelado" : "error");
  if (!sameState(request.cookies.get("ms_oauth_state")?.value, p.get("state"))) return back("estado");
  const code = p.get("code");
  if (!code) return back("error");
  try {
    const t = await exchangeMsCode(code, msRedirectUri(request.nextUrl.origin));
    if (!t.refreshToken) return back("sin-token");
    if (!/mail\.read/i.test(t.scope)) return back("permisos");
    const me = await msMe(t.accessToken);
    if (!me.email) return back("error");
    const admin = createAdminClient();
    const { error } = await admin.from("mail_accounts").upsert(
      { user_id: userId, workspace_id: workspaceId, provider: "microsoft", email: me.email, display_name: me.name, refresh_token_enc: encryptSecret(t.refreshToken), status: "ok", last_error: null },
      { onConflict: "user_id,provider,email" },
    );
    if (error) { console.error("[outlook] guardar:", error.message); return back("error"); }
    after(() => syncDueMailAccounts(createAdminClient(), { userId, staleMinutes: 0, limit: 3 }).catch(() => null)); // primera carga
    return back("ok");
  } catch (e) {
    console.error("[outlook] callback:", e instanceof Error ? e.message : e);
    return back("error");
  }
}

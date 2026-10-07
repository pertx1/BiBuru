import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/context";
import { microsoftConfig, msAuthUrl, msRedirectUri } from "@/lib/mail/graph";

export const dynamic = "force-dynamic";

/** Inicia el OAuth de Microsoft (solo lectura de correo). El `state` aleatorio va también en una cookie (anti-CSRF). */
export async function GET(request: NextRequest) {
  await getContext(); // exige sesión
  const cfg = microsoftConfig();
  if (!cfg || !process.env.TOKEN_ENCRYPTION_KEY) return NextResponse.redirect(new URL("/ajustes?outlook=sin-configurar#correo", request.nextUrl.origin));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(msAuthUrl({ clientId: cfg.clientId, redirectUri: msRedirectUri(request.nextUrl.origin), state }));
  res.cookies.set("ms_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/outlook", maxAge: 600 });
  return res;
}

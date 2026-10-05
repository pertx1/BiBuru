import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/context";
import { buildAuthUrl, googleConfig, redirectUriFor } from "@/lib/favorites/youtube";

export const dynamic = "force-dynamic";

/** Inicia el OAuth de Google (solo lectura de YouTube). El `state` aleatorio va también en una cookie para evitar CSRF. */
export async function GET(request: NextRequest) {
  await getContext(); // exige sesión
  const cfg = googleConfig();
  if (!cfg || !process.env.TOKEN_ENCRYPTION_KEY) return NextResponse.redirect(new URL("/ajustes?google=sin-configurar#youtube", request.nextUrl.origin));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(buildAuthUrl({ clientId: cfg.clientId, redirectUri: redirectUriFor(request.nextUrl.origin), state }));
  res.cookies.set("google_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/google", maxAge: 600 });
  return res;
}

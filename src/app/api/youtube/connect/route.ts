import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/context";
import { googleConfig } from "@/lib/favorites/youtube";
import { ytAuthUrl, ytRedirectUri } from "@/lib/social/youtube";

export const dynamic = "force-dynamic";

/** Inicia el OAuth de Google para publicar Shorts (permiso `youtube.upload`). `state` aleatorio también en cookie (anti-CSRF). */
export async function GET(request: NextRequest) {
  await getContext();
  const cfg = googleConfig();
  if (!cfg || !process.env.TOKEN_ENCRYPTION_KEY) return NextResponse.redirect(new URL("/redes?youtube=sin-configurar", request.nextUrl.origin));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(ytAuthUrl({ clientId: cfg.clientId, redirectUri: ytRedirectUri(request.nextUrl.origin), state }));
  res.cookies.set("yt_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/youtube", maxAge: 600 });
  return res;
}

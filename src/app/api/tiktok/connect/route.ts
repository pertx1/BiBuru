import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/context";
import { tiktokConfig, ttAuthUrl, ttRedirectUri } from "@/lib/social/tiktok";

export const dynamic = "force-dynamic";

/** Inicia el inicio de sesión de TikTok (Login Kit). `state` aleatorio también en cookie (anti-CSRF). */
export async function GET(request: NextRequest) {
  await getContext();
  const cfg = tiktokConfig();
  if (!cfg || !process.env.TOKEN_ENCRYPTION_KEY) return NextResponse.redirect(new URL("/redes?tiktok=sin-configurar", request.nextUrl.origin));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(ttAuthUrl({ clientKey: cfg.clientKey, redirectUri: ttRedirectUri(request.nextUrl.origin), state }));
  res.cookies.set("tt_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/tiktok", maxAge: 600 });
  return res;
}

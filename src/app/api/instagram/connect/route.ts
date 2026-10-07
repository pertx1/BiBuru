import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/context";
import { igAuthUrl, igRedirectUri, instagramConfig } from "@/lib/social/instagram";

export const dynamic = "force-dynamic";

/** Inicia el inicio de sesión de Instagram (cuentas de empresa o creador). `state` aleatorio también en cookie (anti-CSRF). */
export async function GET(request: NextRequest) {
  await getContext();
  const cfg = instagramConfig();
  if (!cfg || !process.env.TOKEN_ENCRYPTION_KEY) return NextResponse.redirect(new URL("/redes?instagram=sin-configurar", request.nextUrl.origin));
  const state = randomBytes(24).toString("base64url");
  // ?mensajes=1: pide también los permisos de la bandeja (mensajes y comentarios).
  const res = NextResponse.redirect(igAuthUrl({ appId: cfg.appId, redirectUri: igRedirectUri(request.nextUrl.origin), state, inbox: request.nextUrl.searchParams.get("mensajes") === "1" }));
  res.cookies.set("ig_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/instagram", maxAge: 600 });
  return res;
}

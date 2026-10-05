// Cookie de sesión falso para el mini Supabase local (ver mock-supabase.mjs).
import crypto from "node:crypto";
const SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export function sessionCookie(userId, email = "yo@example.com") {
  const now = Math.floor(Date.now() / 1000);
  const claims = { sub: userId, role: "authenticated", aud: "authenticated", email, exp: now + 3600, iat: now };
  const h = b64({ alg: "HS256", typ: "JWT" }), p = b64(claims);
  const jwt = `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`;
  const session = { access_token: jwt, refresh_token: "r", expires_at: now + 3600, expires_in: 3600, token_type: "bearer", user: { id: userId, email, aud: "authenticated", role: "authenticated" } };
  return { name: "sb-localhost-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "localhost", path: "/" };
}

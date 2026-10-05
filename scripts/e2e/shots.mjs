// Capturas de pantalla de la app (modo móvil y escritorio) para revisar el diseño.
// Uso: USER_ID=<uuid> OUT=/tmp/shots node scripts/e2e/shots.mjs "<nombre>:<ruta>[:<tema>]" ...
import { chromium } from "playwright-core";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";

const SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const claims = { sub: process.env.USER_ID, role: "authenticated", aud: "authenticated", email: "yo@example.com", exp: now + 3600, iat: now };
const h = b64({ alg: "HS256", typ: "JWT" }), p = b64(claims);
const jwt = `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`;
const session = { access_token: jwt, refresh_token: "r", expires_at: now + 3600, expires_in: 3600, token_type: "bearer", user: { id: claims.sub, email: claims.email, aud: "authenticated", role: "authenticated" } };
const cookie = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");

const out = process.env.OUT ?? "/tmp/shots";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const devices = { movil: { width: 390, height: 844 }, escritorio: { width: 1280, height: 800 } };
for (const spec of process.argv.slice(2)) {
  const [name, path, theme] = spec.split("|");
  for (const [dev, vp] of Object.entries(devices)) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: theme === "oscuro" ? "dark" : "light", locale: "es-ES", deviceScaleFactor: dev === "movil" ? 2 : 1 });
    await ctx.addCookies([{ name: "sb-localhost-auth-token", value: cookie, domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    await page.goto("http://localhost:3100" + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${name}-${dev}.png`, fullPage: process.env.FULL === "1" });
    await ctx.close();
  }
  console.log("OK", name);
}
await browser.close();

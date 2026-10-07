// Favoritos: pegar varios enlaces de TikTok a la vez (también desde la captura rápida) → se guardan sin duplicar y se analizan.
// Uso: USER_ID=<uuid> node scripts/e2e/tiktok.mjs  (con scripts/e2e/up.sh; sin internet el oEmbed falla y se usa el texto)
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";
import { startFakeGemini } from "./fake-gemini.mjs";

const fake = await startFakeGemini();

const base = "http://localhost:3100";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES" });
await ctx.addCookies([sessionCookie(process.env.USER_ID)]);
const page = await ctx.newPage();
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };
const n = Date.now();
const a = `https://www.tiktok.com/@akerra/video/7${String(n).padStart(18, "0")}`;
const b = `https://www.tiktok.com/@akerra/video/8${String(n).padStart(18, "0")}`;

await page.goto(`${base}/favoritos`, { waitUntil: "networkidle" });
ok(await page.getByLabel("Pegar enlace").isVisible(), "campo «Pegar enlace» siempre visible");
ok(await page.getByRole("button", { name: "Pegar" }).isVisible(), "botón «Pegar»");
await page.getByLabel("Pegar enlace").fill(`${a}\n${b} ${a}`);
await page.getByRole("button", { name: "Guardar", exact: true }).click();
await page.getByText(/2 guardados/).waitFor({ timeout: 15000 });
ok(true, "dos enlaces pegados a la vez → 2 guardados (el repetido no cuenta)");

await page.getByLabel("Pegar enlace").fill(a);
await page.getByRole("button", { name: "Guardar", exact: true }).click();
await page.getByText(/1 ya estaba/).waitFor({ timeout: 15000 });
ok(true, "sin duplicados");

// Se analiza solo (Gemini falso) y la ficha dice en qué se basa.
for (let i = 0; i < 20; i++) {
  await page.goto(`${base}/favoritos?estado=todos`, { waitUntil: "networkidle" });
  if (await page.getByText(/Listo · texto/).count() >= 2) break;
  await page.waitForTimeout(1500);
}
ok(await page.getByText(/Listo · texto/).count() >= 2, "análisis automático con la base indicada en la tarjeta");
await page.getByText(/Listo · texto/).first().click();
ok(await page.getByText("Análisis basado en:").isVisible(), "la ficha dice en qué se basa el análisis");
ok(await page.getByRole("button", { name: "Subir el vídeo" }).isVisible(), "botón «Subir el vídeo» para el análisis completo");
await browser.close();
fake.close?.();
process.exit(0);

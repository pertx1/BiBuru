// Varios vídeos de YouTube a la vez (rama arreglo-analisis-videos). Gemini falso que, como el real en el plan
// gratuito, responde 429 si le llegan dos vídeos a la vez, y un primer 429 por minuto con «retryDelay».
// Uso: USER_ID=<uuid> node scripts/e2e/videos-queue.mjs  (con scripts/e2e/up.sh levantado; usa el puerto 9500)
import http from "node:http";
import pg from "pg";
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const base = "http://localhost:3100";
const CRON = "test-cron-secret-0123456789abcdef";
const db = new pg.Client({ connectionString: "postgres://postgres:postgres@localhost:5432/biburu_test" });
await db.connect();
const q = (s, p) => db.query(s, p);
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let active = 0, maxActive = 0, sent429 = 0, first429 = true;
const seen = [];
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    const body = raw ? JSON.parse(raw) : {};
    const uri = body.contents?.flatMap((c) => c.parts ?? []).find((p) => p.fileData)?.fileData?.fileUri;
    res.setHeader("Content-Type", "application/json");
    if (!uri) { res.end(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: "ok" }] }, finishReason: "STOP" }] })); return; }
    seen.push({ uri, res: body.generationConfig?.mediaResolution ?? body.config?.mediaResolution, max: body.generationConfig?.maxOutputTokens });
    const tooMany = (msg, delay) => { sent429++; res.writeHead(429).end(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: msg, details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: delay }] } })); };
    if (active > 0) return tooMany("You exceeded your current quota (GenerateContentInputTokensPerModelPerMinute-FreeTier). Please retry in 40s.", "40s");
    if (first429) { first429 = false; return tooMany("You exceeded your current quota. Please retry in 37.06s.", "37s"); }
    active++; maxActive = Math.max(maxActive, active);
    await sleep(1500);
    active--;
    res.end(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify({ summary: `Resumen de ${uri}`, key_points: ["Uno"], category: "marketing", tags: ["prueba"], actions: ["Probar"], business: null, business_reason: null, utility: 4 }) }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 30000, candidatesTokenCount: 300 } }));
  });
});
await new Promise((r) => server.listen(9500, r));

const ws = (await q("select default_workspace_id id from profiles where user_id=$1", [process.env.USER_ID])).rows[0].id;
await q("delete from saved_videos where workspace_id=$1", [ws]);
// Un vídeo que falló antes del arreglo con el 429 en inglés: debe volver solo a la cola.
await q(`insert into saved_videos (workspace_id,user_id,source,external_id,url,title,analysis_status,analysis_error,analysis_attempts,added_via)
  values ($1,$2,'youtube','zzzzzzzzzzz','https://www.youtube.com/watch?v=zzzzzzzzzzz','Viejo con 429','error','got status: 429 Too Many Requests. {"error":{"status":"RESOURCE_EXHAUSTED"}}',4,'manual')`, [ws, process.env.USER_ID]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", timezoneId: "Europe/Madrid" });
await ctx.addCookies([sessionCookie(process.env.USER_ID)]);
const page = await ctx.newPage();
await page.goto(`${base}/favoritos`, { waitUntil: "networkidle" });
const ids = ["aaaaaaaaaa1", "aaaaaaaaaa2", "aaaaaaaaaa3", "aaaaaaaaaa4"];
await page.getByLabel("Pegar enlace").fill(ids.map((i) => `https://www.youtube.com/watch?v=${i}`).join("\n"));
await page.getByRole("button", { name: "Guardar", exact: true }).click();

const statuses = async () => (await q("select external_id, analysis_status s, analysis_error e from saved_videos where workspace_id=$1 order by external_id", [ws])).rows;
// El primero recibe el 429 «por minuto» y vuelve a la cola con espera; los otros tres se analizan uno detrás de otro.
for (let i = 0; i < 40; i++) { const s = await statuses(); if (s.filter((r) => r.s === "ready").length >= 3) break; await sleep(500); }
let s = await statuses();
console.log(s);
ok(maxActive === 1, `nunca hay dos vídeos a la vez en Gemini (máx. ${maxActive})`);
ok(sent429 === 1, `solo el 429 simulado del primero (${sent429})`);
ok(s.filter((r) => r.s === "ready").length === 3, "los otros tres se analizan en fila tras guardarlos juntos");
const limited = s.find((r) => r.s === "pending" && r.external_id !== "zzzzzzzzzzz");
ok(limited && /límite de vídeos por minuto/.test(limited.e), `el del 429 queda en cola con mensaje en español: ${limited?.e}`);
ok(seen.every((r) => r.res === "MEDIA_RESOLUTION_LOW" && r.max === 8192), "vídeo a resolución baja y margen de salida amplio");
const next = (await q("select extract(epoch from analysis_next_try_at - now())::int d, analysis_attempts n from saved_videos where external_id=$1", [limited.external_id])).rows[0];
ok(next.d > 40 && next.d <= 65 && next.n === 0, "espera ~1 min y no gasta un intento");

const title = "El que esperaba a Gemini";
await q("update saved_videos set title=$2 where external_id=$1", [limited.external_id, title]);
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: new RegExp(title) }).first().click({ timeout: 5000 });
await page.waitForTimeout(500);
const fic = (await page.locator("dialog[open]").innerText().catch(() => "SIN DIALOGO")).replace(/\s+/g, " "); ok(/de uno en uno.*límite de vídeos por minuto/.test(fic), `la ficha lo explica: ${fic.slice(0, 300)}`);
await page.screenshot({ path: process.env.SHOT ?? "/tmp/videos-queue.png", fullPage: true });

// Pasa la espera: el cron recoge el que esperaba y el viejo con 429.
await q("update saved_videos set analysis_next_try_at = now() - interval '1 second' where workspace_id=$1 and analysis_status='pending'", [ws]);
const r = await fetch(`${base}/api/cron/videos`, { method: "POST", headers: { Authorization: `Bearer ${CRON}` } }).then((x) => x.json());
console.log(r);
s = await statuses();
ok(s.every((x) => x.s === "ready"), `todos analizados (${s.map((x) => x.s).join(", ")})`);
ok(maxActive === 1, "y siempre de uno en uno");
await browser.close(); server.close(); await db.end();

// TikTok: la IA ve el vídeo entero. TikTok falso (página con cookies, bloqueo + tikwm, fallo total) y Gemini falso.
// Uso: TIKTOK_FETCH_TEST_BASE=http://localhost:9600 bash scripts/e2e/up.sh; USER_ID=<uuid> node scripts/e2e/tiktok-video.mjs
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
const MP4 = Buffer.from("00000018667479706d703432fake-video", "utf8");

// --- TikTok falso: <base>/<host>/<ruta>
const tt = [];
const tiktok = http.createServer((req, res) => {
  tt.push(req.url);
  const page = (id, extra = {}) => `<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ __DEFAULT_SCOPE__: { "webapp.video-detail": { itemInfo: { itemStruct: { id, video: { playAddr: `https://v16-webapp-prime.tiktok.com/video/${id}.mp4`, duration: 35, ...extra } } } } } })}</script></html>`;
  if (req.url === "/www.tiktok.com/@akerra/video/1111111111111111111") { res.writeHead(200, { "content-type": "text/html", "set-cookie": "tt_chain_token=t1; Path=/" }); return res.end(page("1111111111111111111")); }
  if (req.url === "/v16-webapp-prime.tiktok.com/video/1111111111111111111.mp4") {
    if (!/tt_chain_token=t1/.test(req.headers.cookie ?? "")) { res.writeHead(403); return res.end(); }
    res.writeHead(200, { "content-type": "video/mp4" }); return res.end(MP4);
  }
  if (req.url?.startsWith("/www.tiktok.com/@akerra/video/2222222222222222222")) { res.writeHead(403); return res.end("captcha"); }
  if (req.url?.startsWith("/www.tikwm.com/api/") && req.url.includes("2222222222222222222")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ code: 0, data: { play: "/video/media/play/222.mp4", duration: 20 } })); }
  if (req.url === "/www.tikwm.com/video/media/play/222.mp4") { res.writeHead(200, { "content-type": "video/mp4" }); return res.end(MP4); }
  if (req.url?.startsWith("/www.tikwm.com/api/")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ code: -1, msg: "no" })); }
  if (req.url === "/www.tiktok.com/@akerra/video/4444444444444444444") { res.writeHead(200, { "content-type": "text/html", "set-cookie": "tt_chain_token=t1" }); return res.end(page("1111111111111111111")); }
  res.writeHead(404); res.end();
});
await new Promise((r) => tiktok.listen(9600, r));

// --- Gemini falso
const seen = [];
const gemini = http.createServer((req, res) => {
  let raw = ""; req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    const parts = (body.contents ?? []).flatMap((c) => c.parts ?? []);
    const text = parts.map((p) => p.text ?? "").join(" ");
    const inline = parts.find((p) => p.inlineData);
    seen.push({ video: inline?.inlineData?.mimeType === "video/mp4" && Buffer.from(inline.inlineData.data, "base64").equals(MP4), text, model: req.url });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify({ summary: inline?.inlineData?.mimeType === "video/mp4" ? "Resumen viendo el vídeo" : "Resumen con texto", key_points: ["Uno"], category: "marketing", tags: [], actions: ["Probar"], business: null, business_reason: null, utility: 4 }) }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 3500, candidatesTokenCount: 200 } }));
  });
});
await new Promise((r) => gemini.listen(9500, r));

const ws = (await q("select default_workspace_id id from profiles where user_id=$1", [process.env.USER_ID])).rows[0].id;
await q("delete from saved_videos where workspace_id=$1", [ws]);
// Uno analizado antes de esto (solo texto, con categoría elegida a mano): debe volver a la cola y analizarse con el vídeo.
const cat = (await q("insert into video_categories (workspace_id,user_id,name) values ($1,$2,'Elegida a mano') on conflict do nothing returning id", [ws, process.env.USER_ID])).rows[0]?.id
  ?? (await q("select id from video_categories where workspace_id=$1 and name='Elegida a mano'", [ws])).rows[0].id;
await q(`insert into saved_videos (workspace_id,user_id,source,external_id,url,title,analysis_status,analysis_mode,analysis_basis,summary,category_id,added_via)
  values ($1,$2,'tiktok','4444444444444444444','https://www.tiktok.com/@akerra/video/4444444444444444444','Antiguo solo texto','ready','text','texto_portada','Resumen viejo',$3,'manual')`, [ws, process.env.USER_ID, cat]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", timezoneId: "Europe/Madrid" });
await ctx.addCookies([sessionCookie(process.env.USER_ID)]);
const page = await ctx.newPage();
await page.goto(`${base}/favoritos`, { waitUntil: "networkidle" });
await page.getByLabel("Pegar enlace").fill(["1111111111111111111", "2222222222222222222", "3333333333333333333"].map((i) => `https://www.tiktok.com/@akerra/video/${i}`).join("\n"));
await page.getByRole("button", { name: "Guardar", exact: true }).click();

const rows = async () => (await q("select external_id id, analysis_status s, analysis_basis b, tiktok_fetch f, summary, duration_sec d, category_id c from saved_videos where workspace_id=$1 order by external_id", [ws])).rows;
for (let i = 0; i < 60; i++) { if ((await rows()).filter((r) => r.s === "ready" && r.id !== "4444444444444444444").length === 3) break; await sleep(500); }
let r = await rows();
console.log(r.map(({ id, s, b, f, d }) => ({ id, s, b, f, d })));
const by = (id) => r.find((x) => x.id.startsWith(id));
ok(by("1").b === "video_completo" && by("1").f === "ok" && by("1").summary === "Resumen viendo el vídeo" && by("1").d === 35, "página de TikTok: baja el vídeo con sus cookies y la IA lo ve entero");
ok(by("2").b === "video_completo" && by("2").f === "ok" && by("2").d === 20, "TikTok bloquea la página: respaldo tikwm");
ok(by("3").b !== "video_completo" && by("3").f === "failed" && by("3").summary === "Resumen con texto", "si no se puede bajar: texto y portada, marcado");
ok(seen.filter((s) => s.video).length === 2, "Gemini recibe 2 vídeos reales");
ok(!tt.some((u) => !/^\/(www\.tiktok\.com|v16-webapp-prime\.tiktok\.com|www\.tikwm\.com)\//.test(u)), "solo se pide a TikTok y tikwm");

// Ficha del que falló: aviso y reintento.
await page.reload({ waitUntil: "networkidle" });
await q("update saved_videos set title='El que no se pudo bajar' where external_id='3333333333333333333'");
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /El que no se pudo bajar/ }).first().click();
await page.waitForTimeout(400);
ok(await page.getByText(/No se pudo bajar el vídeo de TikTok/).isVisible(), "la ficha explica que no se pudo bajar");
ok(await page.getByRole("button", { name: "Reintentar con el vídeo" }).isVisible(), "y ofrece reintentar");
await page.screenshot({ path: process.env.SHOT ?? "/tmp/tiktok-video.png", fullPage: true });
await page.keyboard.press("Escape");

// El antiguo vuelve a la cola por el cron y se analiza con el vídeo, sin perder la categoría elegida.
const c = await fetch(`${base}/api/cron/videos`, { method: "POST", headers: { Authorization: `Bearer ${CRON}` } }).then((x) => x.json());
console.log(c);
r = await rows();
ok(by("4").s === "ready" && by("4").b === "video_completo" && by("4").f === "ok" && by("4").summary === "Resumen viendo el vídeo", "los TikTok antiguos se vuelven a analizar con el vídeo");
ok(by("4").c === cat, "respeta la categoría elegida a mano");
const again = await fetch(`${base}/api/cron/videos`, { method: "POST", headers: { Authorization: `Bearer ${CRON}` } }).then((x) => x.json());
ok(again.processed === 0, "y solo una vez (el que falló no entra en bucle)");
await browser.close(); tiktok.close(); gemini.close(); await db.end();

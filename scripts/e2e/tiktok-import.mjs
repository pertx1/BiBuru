// Importar Favoritos de TikTok desde el ZIP de «Descargar tus datos». TikTok y Gemini falsos.
// Uso: TIKTOK_FETCH_TEST_BASE=http://localhost:9600 bash scripts/e2e/up.sh; USER_ID=<uuid> node scripts/e2e/tiktok-import.mjs
import http from "node:http";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import pg from "pg";
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const base = "http://localhost:3100";
const db = new pg.Client({ connectionString: "postgres://postgres:postgres@localhost:5432/biburu_test" });
await db.connect();
const q = (s, p) => db.query(s, p);
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MP4 = Buffer.from("fake-video");
const GOOD = ["7400000000000000001", "7400000000000000002"], GONE = "7400000000000000003", LIKE = "7400000000000000009", HAVE = "7400000000000000004";

const tiktok = http.createServer((req, res) => {
  const m = /^\/www\.tiktok\.com\/@\/video\/(\d+)/.exec(req.url ?? "");
  if (m && GOOD.includes(m[1])) {
    res.writeHead(200, { "content-type": "text/html", "set-cookie": "tt_chain_token=t" });
    return res.end(`<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">${JSON.stringify({ __DEFAULT_SCOPE__: { "webapp.video-detail": { itemInfo: { itemStruct: { desc: `Tutorial ${m[1].slice(-1)} #ropa`, author: { uniqueId: "creadora" }, video: { playAddr: `https://v16-webapp-prime.tiktok.com/v/${m[1]}.mp4`, duration: 25 } } } } } })}</script>`);
  }
  if (req.url?.startsWith("/v16-webapp-prime.tiktok.com/v/")) { res.writeHead(200, { "content-type": "video/mp4" }); return res.end(MP4); }
  if (req.url?.startsWith("/www.tikwm.com/api/")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ code: -1 })); }
  res.writeHead(404); res.end();
});
await new Promise((r) => tiktok.listen(9600, r));
const gemini = http.createServer((req, res) => {
  let raw = ""; req.on("data", (c) => (raw += c));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify({ summary: "Resumen viendo el vídeo", key_points: ["Uno"], category: "marketing", tags: [], actions: ["Probar"], business: null, business_reason: null, utility: 4 }) }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 3000, candidatesTokenCount: 100 } }));
  });
});
await new Promise((r) => gemini.listen(9500, r));

// ZIP como el de TikTok.
const share = (id) => `https://www.tiktokv.com/share/video/${id}/`;
const json = { Activity: { "Favorite Videos": { FavoriteVideoList: [...GOOD, GONE, HAVE].map((id, i) => ({ Date: `2025-0${i + 1}-01 10:00:00`, Link: share(id) })) }, "Like List": { ItemFavoriteList: [{ Date: "2025-01-01", Link: share(LIKE) }] } } };
const zipPath = join(mkdtempSync(join(tmpdir(), "tt-")), "TikTok_Data.zip");
writeFileSync(zipPath, zip([{ name: "user_data_tiktok.json", data: Buffer.from(JSON.stringify(json)) }]));

const ws = (await q("select default_workspace_id id from profiles where user_id=$1", [process.env.USER_ID])).rows[0].id;
await q("delete from saved_videos where workspace_id=$1", [ws]);
await q("insert into saved_videos (workspace_id,user_id,source,external_id,url,title,analysis_status,added_via) values ($1,$2,'tiktok',$3,$4,'Ya lo tenía','ready','manual')", [ws, process.env.USER_ID, HAVE, `https://www.tiktok.com/@x/video/${HAVE}`]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", timezoneId: "Europe/Madrid" });
await ctx.addCookies([sessionCookie(process.env.USER_ID)]);
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${base}/favoritos`, { waitUntil: "networkidle" });
await page.getByText("Importar Favoritos de TikTok").click();
await page.getByLabel("Archivo de datos de TikTok").setInputFiles(zipPath);
await page.getByRole("button", { name: "Importar 4 vídeos" }).waitFor({ timeout: 10_000 });
ok(await page.getByText("«Me gusta»").isVisible(), "lee el ZIP: 4 favoritos y 1 «me gusta» (este apagado por defecto)");
await page.screenshot({ path: process.env.SHOT ?? "/tmp/tiktok-import.png", fullPage: true });
await page.getByRole("button", { name: "Importar 4 vídeos" }).click();
await page.getByText(/3 vídeos nuevos en Favoritos \(1 ya estaban\)/).waitFor({ timeout: 15_000 });
ok(true, "importa 3 nuevos y no repite el que ya estaba");
ok((await q("select count(*)::int n from saved_videos where workspace_id=$1 and external_id=$2", [ws, LIKE])).rows[0].n === 0, "los «me gusta» solo si los marcas");

const rows = async () => (await q("select external_id id, analysis_status s, title, channel, url, analysis_basis b, analysis_error e, origin_list o from saved_videos where workspace_id=$1 and added_via='tiktok_import' order by external_id", [ws])).rows;
for (let i = 0; i < 60; i++) { const r = await rows(); if (r.filter((x) => x.s === "ready").length === 2 && r.find((x) => x.id === GONE)?.s !== "analyzing") break; await sleep(500); }
const r = await rows();
console.log(r);
const g = r.find((x) => x.id === GOOD[0]);
ok(g.s === "ready" && g.b === "video_completo" && g.title === "Tutorial 1 #ropa" && g.channel === "creadora" && g.url === `https://www.tiktok.com/@creadora/video/${GOOD[0]}` && g.o === "Favoritos de TikTok", "se analiza con el vídeo y rellena título, autor y enlace");
const gone = r.find((x) => x.id === GONE);
ok(gone.s === "pending" && /No se pudo abrir este TikTok/.test(gone.e), "uno borrado: queda en cola con aviso (se reintenta y luego error), sin analizar texto vacío");
ok(errors.length === 0, `sin errores de JavaScript ${errors.join(" | ")}`);
await browser.close(); tiktok.close(); gemini.close(); await db.end();

function zip(files) {
  const locals = [], centrals = []; let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), comp = deflateRawSync(f.data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(f.data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(f.data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, name, comp); centrals.push(ch, name); offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

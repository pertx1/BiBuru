// Redes: publicar de verdad contra Instagram y TikTok falsos (scripts/e2e/fake-social.mjs en :9700).
// Sube un vídeo vertical desde el móvil, texto distinto por red, «Publicar ahora», dos pasadas del programador a la vez
// (no se publica dos veces), borrado del archivo al acabar, límite diario de Instagram, error en español con reintento y duplicar.
// Uso: node scripts/e2e/fake-social.mjs & USER_ID=<uuid> node scripts/e2e/social-publish.mjs  (con scripts/e2e/up.sh; necesita ffmpeg)
import { execSync } from "node:child_process";
import { createCipheriv, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const base = "http://localhost:3100", fake = "http://localhost:9700";
const db = new pg.Client({ connectionString: "postgres://postgres:postgres@localhost:5432/biburu_test" });
await db.connect();
const q = async (s, p) => (await db.query(s, p)).rows;
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };
const control = async (qs) => (await fetch(`${fake}/control?${qs}`)).json();
const cron = () => fetch(`${base}/api/cron/social`, { headers: { authorization: "Bearer test-cron-secret-0123456789abcdef" } }).then((r) => r.json());
const enc = (plain) => { // mismo formato que src/lib/favorites/crypto.ts, con la clave de pruebas de up.sh
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", Buffer.alloc(32, 5), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
};
const U = process.env.USER_ID;
const ws = (await q("select default_workspace_id id from profiles where user_id=$1", [U]))[0].id;
await q("delete from social_accounts where workspace_id=$1", [ws]);
await q("delete from social_posts where workspace_id=$1", [ws]);
await q("delete from businesses where workspace_id=$1 and name='Redes SL'", [ws]);
await control("reset=1");

// Vídeo vertical 9:16 de 4 s y uno horizontal, hechos con ffmpeg.
const dir = mkdtempSync(join(tmpdir(), "biburu-redes-"));
const vertical = join(dir, "vertical.mp4"), horizontal = join(dir, "horizontal.mp4");
execSync(`ffmpeg -loglevel error -y -f lavfi -i testsrc=size=540x960:rate=30 -t 4 -c:v libx264 -pix_fmt yuv420p ${vertical}`);
execSync(`ffmpeg -loglevel error -y -f lavfi -i testsrc=size=960x540:rate=30 -t 4 -c:v libx264 -pix_fmt yuv420p ${horizontal}`);

const biz = (await q("insert into businesses (workspace_id,user_id,name,color) values ($1,$2,'Redes SL','#be185d') returning id", [ws, U]))[0].id;
const accRow = (platform, ext, user, extra = {}) => q(
  `insert into social_accounts (workspace_id,user_id,business_id,platform,external_id,username,access_token_enc,refresh_token_enc,token_expires_at,refresh_expires_at,scopes,last_snapshot_on,last_media_sync_at)
   values ($1,$2,$3,$4,$5,$6,$7,$8,now() + $9::interval,now() + interval '300 days',$10,current_date - 1,now()) returning id`,
  [ws, U, biz, platform, ext, user, enc("tok-" + user), extra.refresh ?? null, extra.exp ?? "50 days", extra.scopes ?? null]).then((r) => r[0].id);
const ig = await accRow("instagram", "17841", "akerra_ig");
await accRow("tiktok", "open-1", "akerra_tt", { refresh: enc("ref"), exp: "20 hours", scopes: "user.info.basic,video.list,video.upload" });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", permissions: ["clipboard-read", "clipboard-write"] });
await ctx.addCookies([sessionCookie(U)]);
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
const toast = (re) => page.getByText(re).first().waitFor({ timeout: 15000 }).then(() => true, () => false);

// 1) Nueva publicación desde la pestaña Redes del negocio, en el móvil.
await page.goto(`${base}/negocios/${biz}/redes`, { waitUntil: "networkidle" });
ok(await page.getByText("@akerra_ig").first().isVisible() && await page.getByText("@akerra_tt").first().isVisible(), "las dos cuentas del negocio");
await page.getByRole("button", { name: "Nueva publicación" }).click();
await page.locator("#sp-cap").waitFor();
await page.getByLabel("Archivos").setInputFiles(horizontal);
ok(await toast(/No es vertical 9:16 \(960×540\)/), "aviso: vídeo horizontal");
await page.locator("[aria-label='Quitar archivo']").first().waitFor();
await page.locator("[aria-label='Quitar archivo']").first().click();
await page.waitForTimeout(1000);
await page.getByLabel("Archivos").setInputFiles(vertical);
await page.getByRole("figure", { name: "Vista previa en el móvil" }).waitFor({ timeout: 15000 });
ok(true, "vista previa 9:16 con el vídeo");
await page.locator("#sp-kind").selectOption("reel");
await page.locator("#sp-cap").fill("Nueva sudadera Eguzkilore");
await page.locator("#sp-tags").fill("akerra moda");
await page.getByLabel("Texto distinto para Instagram y TikTok").check();
await page.locator("#sp-cap-ig").fill("Solo para Instagram: link en la bio");
await page.getByLabel(/Instagram @akerra_ig/).check();
await page.getByLabel(/TikTok @akerra_tt/).check();
await page.screenshot({ path: process.env.SHOT ?? "/tmp/social-publish.png", fullPage: true });
await page.getByRole("button", { name: "Publicar ahora" }).click();
ok(await toast(/Publicando/), "«Publicar ahora»");

// 2) El primer paso sale enseguida (tras responder): contenedor de Instagram y subida del borrador a TikTok.
const post = (await q("select id from social_posts where workspace_id=$1", [ws]))[0].id;
const wait = async (cond, ms = 20000) => { for (let t = 0; t < ms; t += 500) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 500)); } return false; };
ok(await wait(async () => (await control("")).igContainers.length === 1 && (await control("")).ttUploads.length === 1), "contenedor de Instagram creado y vídeo subido a TikTok");
let st = await control("");
ok(st.downloads[0] > 1000, `Instagram descargó el vídeo de la URL firmada (${st.downloads[0]} bytes)`);
ok(st.igContainers[0].media_type === "REELS" && st.igContainers[0].caption === "Solo para Instagram: link en la bio\n\n#akerra #moda", "Reel con el texto de Instagram y los hashtags");
ok(st.ttInits[0].mode === "draft" && st.ttUploads[0] > 1000, "TikTok en modo borrador (bandeja)");

// 3) Dos pasadas del programador a la vez: se publica una sola vez.
await q("update social_post_targets set next_try_at = now() - interval '1 second' where post_id=$1", [post]);
await Promise.all([cron(), cron()]);
st = await control("");
ok(st.igPublished.length === 1 && st.ttInits.length === 1, `ni Instagram ni TikTok se envían dos veces (${st.igPublished.length} publicación, ${st.ttInits.length} subida)`);
const targets = await q("select t.status, t.permalink, t.locked_until, a.platform from social_post_targets t join social_accounts a on a.id=t.account_id where post_id=$1 order by a.platform", [post]);
ok(targets[0].status === "publicada" && targets[0].permalink === "https://www.instagram.com/reel/m1/", "Instagram: publicada con su enlace");
ok(targets[1].status === "enviada", "TikTok: enviado a la bandeja (pendiente de publicar en la app)");
ok(targets.every((t) => t.locked_until === null), "bloqueos soltados");
ok((await q("select status from social_posts where id=$1", [post]))[0].status === "publicada", "publicación hecha");
const files = await q("select path, deleted_at from social_post_files where post_id=$1", [post]);
const stored = await (await fetch("http://localhost:54321/storage/v1/__files")).json();
ok(files.length === 1 && files[0].deleted_at && !stored.includes(`social-media/${files[0].path}`), "el vídeo se borra del almacenamiento al salir bien");
ok((await q("select 1 from notification_log where dedupe_key like 'social:%'")).length >= 1, "aviso al móvil para publicar el borrador de TikTok");

// 4) En la lista: filtro «Falta publicar en TikTok», copiar el texto y duplicar.
await page.goto(`${base}/negocios/${biz}/redes`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Falta publicar en TikTok/ }).click();
await page.getByText("Nueva sudadera Eguzkilore").first().click();
await page.getByRole("button", { name: "Copiar texto para TikTok" }).click();
ok((await page.evaluate(() => navigator.clipboard.readText())) === "Nueva sudadera Eguzkilore\n\n#akerra #moda", "copia el texto común para TikTok");
await page.getByRole("button", { name: "Duplicar como borrador" }).click();
ok(await toast(/vuelve a subirlos/), "duplicar avisa de que los archivos ya se borraron");
const copies = await q("select status, caption_instagram from social_posts where workspace_id=$1 and title like 'Copia de%'", [ws]);
ok(copies.length === 1 && copies[0].status === "borrador" && copies[0].caption_instagram === "Solo para Instagram: link en la bio", "copia en borrador con sus textos");

// 5) Límite diario de Instagram: espera sin gastar intentos.
const mk = async (title) => {
  const id = (await q("insert into social_posts (workspace_id,user_id,business_id,title,caption,media_kind,scheduled_at,status) values ($1,$2,$3,$4,'x','reel',now() - interval '1 minute','programada') returning id", [ws, U, biz, title]))[0].id;
  const path = `${ws}/${id}/v.mp4`;
  await fetch(`http://localhost:54321/storage/v1/object/social-media/${path}`, { method: "POST", headers: { "content-type": "video/mp4" }, body: Buffer.from("fake-video-bytes-".repeat(100)) });
  await q("insert into social_post_files (workspace_id,user_id,post_id,path,mime,size_bytes) values ($1,$2,$3,$4,'video/mp4',1700)", [ws, U, id, path]);
  await q("insert into social_post_targets (workspace_id,user_id,post_id,account_id) values ($1,$2,$3,$4)", [ws, U, id, ig]);
  return id;
};
await control("quota=50");
const full = await mk("Cupo lleno");
await cron();
let t = (await q("select status, attempts, error, next_try_at > now() + interval '50 minutes' later from social_post_targets where post_id=$1", [full]))[0];
ok(t.status === "pendiente" && t.attempts === 0 && /50 de 50 publicaciones en 24 h/.test(t.error) && t.later, `sin cupo: espera 1 h sin gastar intento («${t.error}»)`);
await control("quota=0");
await q("delete from social_posts where id=$1", [full]);

// 6) Error de Instagram en español, con reintento a los 5 min; tras 3 intentos, «error» y botón Reintentar.
await control("fail=2207026");
const bad = await mk("Formato malo");
await cron();
t = (await q("select status, attempts, error, round(extract(epoch from next_try_at - now()) / 60) mins from social_post_targets where post_id=$1", [bad]))[0];
ok(t.status === "error" && /MP4 o MOV/.test(t.error), `formato no válido: error en español, sin reintentar («${t.error}»)`);
await page.goto(`${base}/negocios/${biz}/redes`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Con error/ }).click();
await page.getByText("Formato malo").first().click();
await page.getByRole("button", { name: "Reintentar" }).click();
await page.waitForTimeout(1500);
ok((await q("select status from social_post_targets where post_id=$1", [bad]))[0].status === "pendiente", "«Reintentar» lo vuelve a poner en cola");
await cron();
ok((await q("select status from social_post_targets where post_id=$1", [bad]))[0].status === "publicando", "y al reintentar sale bien");

ok(errors.length === 0, `sin errores de JavaScript ${errors.join(" | ")}`);
ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "sin scroll horizontal en el móvil");
await browser.close(); await db.end();

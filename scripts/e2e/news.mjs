// Recorrido de Noticias: feeds locales falsos (con duplicados, sin imagen, deportes y Bluesky), Gemini falso y servicio push falso.
// Requiere la app levantada con SAFE_FETCH_ALLOW_LOCAL=1 (solo pruebas). Uso: USER_ID=… OUT=/tmp/x node scripts/e2e/news.mjs
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import pg from "pg";
import { chromium } from "playwright-core";
import { startFakeGemini } from "./fake-gemini.mjs";
import { sessionCookie } from "./session.mjs";

const U = process.env.USER_ID, out = process.env.OUT ?? "/tmp", base = "http://localhost:3100", CRON = "test-cron-secret-0123456789abcdef";
const db = new pg.Client({ connectionString: "postgres://postgres:postgres@localhost:5432/biburu_test" }); await db.connect();
const q = (s, p) => db.query(s, p);
let fails = 0; const check = (n, ok, x = "") => { console.log(ok ? "✔" : "✘", n, x); if (!ok) fails++; };
const gem = await startFakeGemini(9500);
const iso = (h) => new Date(Date.now() - h * 3600_000).toUTCString();

// ------------ feeds locales
const rss = (title, items) => `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>${title}</title>${items.join("")}</channel></rss>`;
const item = (t, link, h, img) => `<item><title><![CDATA[${t}]]></title><link>${link}</link><description><![CDATA[<p>${t}. Entradilla con datos del medio.</p>]]></description><pubDate>${iso(h)}</pubDate>${img ? `<media:content url="${img}" medium="image"/>` : ""}</item>`;
const IMG = (n) => `https://picsum.photos/seed/biburu${n}/800/450`;
const feeds = {
  "/cinco.xml": rss("Cinco Días", [
    item("Las ventas online de moda crecen un 12 % en España", "http://localhost:9600/n/moda", 3, IMG(1)),
    item("Shopify rebaja sus comisiones para tiendas pequeñas", "http://localhost:9600/n/shopify", 5, IMG(2)),
    item("El Barça gana la Champions en el último minuto", "http://localhost:9600/n/futbol", 2, IMG(3)),
    item("Noticia de hace tres días", "http://localhost:9600/n/vieja", 80, IMG(4)),
  ]),
  "/expansion.xml": rss("Expansión", [
    item("Las ventas online de la moda crecen un 12 % en España", "http://localhost:9600/n/moda-2", 4, null),
    item("Hacienda confirma la cuota de autónomos para 2027", "http://localhost:9600/articulo/cuota", 6, null),
  ]),
};
const bsky = { feed: [{ post: { uri: "at://did:plc:x/app.bsky.feed.post/3kabc", author: { handle: "ana.bsky.social", displayName: "Ana Ecommerce" }, record: { text: "TikTok Shop baja la comisión a vendedores nuevos este trimestre. Datos en el hilo.", createdAt: new Date(Date.now() - 2 * 3600_000).toISOString() } } }] };
http.createServer((req, res) => {
  if (feeds[req.url]) { res.writeHead(200, { "Content-Type": "application/rss+xml" }); return res.end(feeds[req.url]); }
  if (req.url.startsWith("/bsky")) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(bsky)); }
  if (req.url === "/articulo/cuota") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(`<html><head><meta property="og:image" content="${IMG(9)}"></head><body>…</body></html>`); }
  res.writeHead(500); res.end();
}).listen(9600);

// ------------ servicio push falso (descifra de verdad)
const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys(); const authKey = crypto.randomBytes(16); const received = [];
function decrypt(body) {
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), cipher = body.subarray(21 + idlen), uaPub = ecdh.getPublicKey();
  const prk = Buffer.from(crypto.hkdfSync("sha256", ecdh.computeSecret(asPub), authKey, Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", prk, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", prk, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce); d.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
  return JSON.parse(plain.subarray(0, plain.lastIndexOf(2)).toString());
}
https.createServer({ key: fs.readFileSync("/tmp/pushcert/key.pem"), cert: fs.readFileSync("/tmp/pushcert/cert.pem") }, (req, res) => {
  const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => { try { received.push(decrypt(Buffer.concat(chunks))); } catch (e) { received.push({ error: String(e) }); } res.writeHead(201); res.end(); });
}).listen(9443);

const cron = (path) => fetch(base + path, { headers: { Authorization: `Bearer ${CRON}` } }).then((r) => r.json());
const local = () => { const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()); return f; };

// ------------ preparación
const ws = (await q("select default_workspace_id from profiles where user_id=$1", [U])).rows[0].default_workspace_id;
await q("truncate news_digests, news_items, news_sources, news_topics, notification_log, push_subscriptions, ai_usage cascade");
await q("update profiles set news_enabled=false, quiet_hours_start='00:00', quiet_hours_end='00:00', ai_monthly_budget_cents=1000 where user_id=$1", [U]);
await q("insert into businesses (workspace_id,user_id,name,description,color) values ($1,$2,'Akerra','Marca de camisetas y sudaderas con diseños propios, venta online','#7b6cf6') on conflict do nothing", [ws, U]);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "es-ES", colorScheme: "dark" });
await ctx.addCookies([sessionCookie(U)]);
// Las fotos de ejemplo se sirven aquí mismo (el entorno de pruebas no sale a internet).
const COLORS = ["#2563eb", "#f59e0b", "#16a34a", "#db2777", "#7c3aed", "#0891b2", "#ea580c", "#4f46e5", "#be123c", "#0d9488"];
await ctx.route("https://picsum.photos/**", (route) => {
  const n = Number(route.request().url().match(/biburu(\d+)/)?.[1] ?? 0), c = COLORS[n % COLORS.length];
  route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#111"/></linearGradient></defs><rect width="800" height="450" fill="url(#g)"/><circle cx="620" cy="120" r="90" fill="#fff" opacity=".15"/><rect x="60" y="300" width="380" height="26" rx="8" fill="#fff" opacity=".35"/><rect x="60" y="345" width="260" height="20" rx="8" fill="#fff" opacity=".25"/></svg>` });
});
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto(base + "/noticias"); await page.waitForSelector("h1");
const seeded = (await q("select (select count(*) from news_topics)::int t, (select count(*) from news_sources)::int s")).rows[0];
check("temas y medios precargados al entrar", seeded.t === 5 && seeded.s >= 10, JSON.stringify(seeded));
await q("update news_sources set active = (name = 'Expansión') where preset");
const topic = (await q("select id from news_topics where name like 'Ecommerce%'")).rows[0].id;
for (const [kind, name, url] of [["rss", "Cinco Días (local)", "http://localhost:9600/cinco.xml"], ["rss", "Expansión (local)", "http://localhost:9600/expansion.xml"], ["bluesky", "@ana.bsky.social", "http://localhost:9600/bsky"]])
  await q("insert into news_sources (workspace_id,user_id,kind,name,url,topic_id) values ($1,$2,$3,$4,$5,$6)", [ws, U, kind, name, url.replace("http://", "https://"), kind === "bluesky" ? topic : null]);
// El esquema solo admite https: las locales se guardan así y se sirven por http mediante la excepción de pruebas.
await q("update news_sources set url = replace(url, 'https://localhost', 'http://localhost') where url like 'https://localhost%'").catch(() => {});
await q("alter table news_sources drop constraint if exists news_sources_url_check");
await q("update news_sources set url = replace(url, 'https://localhost', 'http://localhost') where url like 'https://localhost%'");
await q(`update profiles set news_enabled=true, news_time=$2 where user_id=$1`, [U, local()]);
const sub = { endpoint: "https://localhost:9443/push/me", p256dh: ecdh.getPublicKey().toString("base64url"), auth: authKey.toString("base64url") };
await q("insert into push_subscriptions (workspace_id,user_id,endpoint,p256dh,auth,user_agent) values ($1,$2,$3,$4,$5,'Android')", [ws, U, sub.endpoint, sub.p256dh, sub.auth]);

// ------------ cron de noticias (dos veces) y aviso (dos veces)
const r1 = await cron("/api/cron/news");
const r2 = await cron("/api/cron/news");
console.log("cron noticias:", JSON.stringify(r1), JSON.stringify(r2));
const digests = (await q("select status, content from news_digests where user_id=$1", [U])).rows;
check("un solo resumen aunque el cron se ejecute dos veces", digests.length === 1 && r2.generated === 0);
const c = digests[0]?.content ?? { items: [] };
check("resumen con IA", digests[0]?.status === "ai", digests[0]?.status);
check("una sola llamada a la IA", (await q("select count(*)::int n from ai_usage where feature='news'")).rows[0].n === 1);
check("descarta deportes y lo de hace 3 días", !c.items.some((i) => /Barça|tres días/.test(i.title)));
check("la misma noticia en dos medios sale una vez", c.items.filter((i) => /ventas online/.test(i.title)).length === 1 && c.items.find((i) => /ventas online/.test(i.title))?.coverage === 2);
check("solo nota 3 o más", c.items.every((i) => i.score >= 3), c.items.map((i) => i.score).join(","));
check("foto por og:image si el feed no la trae", c.items.find((i) => /cuota/.test(i.title))?.imageUrl === IMG(9) || !c.items.some((i) => /cuota/.test(i.title)));
check("Bluesky sin medio que lo recoja: no contrastado", c.items.filter((i) => i.kind === "bluesky").every((i) => i.unverified), JSON.stringify(c.items.map((i) => [i.kind, i.unverified])));
check("fuente caída marcada (Expansión real no es accesible aquí)", (await q("select status from news_sources where name='Expansión' and preset")).rows[0].status === "down");
await cron("/api/cron/reminders"); await cron("/api/cron/reminders");
await new Promise((r) => setTimeout(r, 500));
const news = received.filter((x) => x.kind === "news");
check("una sola notificación «Tus noticias de hoy»", news.length === 1 && news[0].title === "Tus noticias de hoy", JSON.stringify(news.map((n) => n.body)));
check("la notificación lleva la foto de la principal y abre el resumen", !!news[0]?.image && news[0]?.url.startsWith("/noticias?dia="));

// ------------ pantalla
await page.goto(base + "/noticias"); await page.waitForSelector("text=Lo más importante hoy"); await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/news-mobile.png`, fullPage: true });
await page.getByRole("button", { name: "Útil" }).first().click(); await page.waitForTimeout(600);
check("«Útil» se guarda", (await q("select count(*)::int n from news_items where feedback='useful'")).rows[0].n === 1);
await page.getByRole("button", { name: "Convertir en tarea" }).first().click(); await page.waitForTimeout(1200);
const task = (await q("select title from tasks order by created_at desc limit 1")).rows[0]?.title ?? "";
check("«Convertir en tarea» usa la acción sugerida", task.startsWith("Revisa cómo afecta"), task);
// Sin presupuesto: «Generar ahora» da titulares sin resumen
await q("update profiles set ai_monthly_budget_cents=0 where user_id=$1", [U]);
await page.getByRole("button", { name: /Generar ahora/ }).click();
await page.waitForSelector("text=Sin presupuesto de IA", { timeout: 60000 }).catch(() => {});
const fb = (await q("select status, manual_runs, content->>'note' note from news_digests where user_id=$1", [U])).rows[0];
check("sin presupuesto: titulares sin resumen", fb.status === "fallback" && /presupuesto/.test(fb.note ?? ""), JSON.stringify(fb));
await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/news-fallback.png` });
await page.getByRole("button", { name: /Generar ahora/ }).click(); await page.waitForTimeout(8000);
await page.goto(base + "/noticias"); await page.waitForTimeout(1000);
check("«Generar ahora» se bloquea tras 2 al día", await page.getByRole("button", { name: /Generar ahora/ }).isDisabled());
await page.goto(base + "/ajustes"); await page.waitForSelector("text=Fuentes");
const sec = page.locator("section", { hasText: "Hora del resumen" }); await sec.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
await sec.screenshot({ path: `${out}/news-settings.png` });
check("sin errores en la página", errs.length === 0, errs.join(" | "));
await browser.close(); await db.end(); gem.close();
process.exit(fails ? 1 : 0);

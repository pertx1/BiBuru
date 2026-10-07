// Redes: estadísticas (con fotos diarias sembradas), nueva publicación (borrador) y calendario de contenido con arrastrar.
// Uso: USER_ID=<uuid> node scripts/e2e/social.mjs  (con scripts/e2e/up.sh; sin claves de Meta/TikTok)
import { execSync } from "node:child_process";
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const U = process.env.USER_ID;
const sql = (s) => execSync(`psql -h localhost -U postgres -d biburu_test -Atc "${s.replace(/"/g, '\\"')}"`, { env: { ...process.env, PGPASSWORD: "postgres" } }).toString().trim().split("\n")[0];
const base = "http://localhost:3100";
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };
const ws = sql(`select default_workspace_id from profiles where user_id='${U}'`);
sql(`delete from social_accounts where workspace_id='${ws}'`); sql(`delete from social_posts where workspace_id='${ws}'`);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES" });
await mob.addCookies([sessionCookie(U)]);
const page = await mob.newPage();
page.on("dialog", (d) => d.accept());

await page.goto(`${base}/redes`, { waitUntil: "networkidle" });
ok(await page.getByText("Instagram: falta conectar.").isVisible() && await page.getByText("TikTok: falta conectar.").isVisible(), "sin claves: «Falta conectar» para Instagram y TikTok");

const acc = sql(`insert into social_accounts (workspace_id,user_id,platform,external_id,username,access_token_enc,token_expires_at) values ('${ws}','${U}','instagram','178','akerra_shop','x',now() + interval '3 days') returning id`);
sql(`insert into social_daily (workspace_id,account_id,day,followers,reach,views,interactions) select '${ws}','${acc}',d::date,1000+n*3,200+n*10,400+n*12,20+n from generate_series(current_date-60,current_date-1,'1 day') with ordinality as g(d,n)`);
sql(`insert into social_media (workspace_id,account_id,external_id,caption,posted_at,interactions,reach,permalink) values ('${ws}','${acc}','m1','Colección otoño',now()-interval '2 days',120,900,'https://www.instagram.com/p/abc/'),('${ws}','${acc}','m2','Detrás de cámaras',now()-interval '9 days',40,500,null)`);
await page.goto(`${base}/redes`, { waitUntil: "networkidle" });
ok(await page.getByText("@akerra_shop").first().isVisible(), "cuenta conectada");
ok(await page.getByText(/La conexión caduca en \d+ días/).isVisible(), "aviso de caducidad del token");
ok(await page.getByText("Seguidores", { exact: true }).first().isVisible() && await page.getByText(/vs periodo anterior/).first().isVisible(), "KPIs con comparación con el periodo anterior");
ok(await page.getByText("Colección otoño").isVisible(), "ranking de publicaciones");
ok(await page.getByText("Mejores días y horas").isVisible(), "mejores días y horas");
ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "sin scroll horizontal en Redes (móvil)");

await page.getByRole("link", { name: "Publicaciones" }).click();
await page.getByRole("button", { name: "Nueva publicación" }).click();
await page.locator("#sp-cap").waitFor();
await page.locator("#sp-cap").fill("Nueva camiseta de otoño");
await page.locator("#sp-tags").fill("#otoño moda");
await page.getByRole("button", { name: "Programar" }).click();
ok(await page.getByText(/Elige al menos una cuenta|Añade al menos una foto/).waitFor({ timeout: 8000 }).then(() => true, () => false), "programar exige cuenta y archivo (aviso visible encima de la hoja)");
await page.getByRole("button", { name: "Guardar borrador" }).click();
await page.waitForTimeout(1200);
ok(await page.getByText("Nueva camiseta de otoño").first().isVisible(), "borrador guardado en la lista");

// Calendario de contenido: una programada aparece y se arrastra a otro día (escritorio).
const tomorrow = sql("select (current_date + 1)::text"), after = sql("select (current_date + 2)::text");
const post = sql(`insert into social_posts (workspace_id,user_id,title,caption,scheduled_at,status) values ('${ws}','${U}','Post calendario','x',('${tomorrow} 18:00'::timestamp at time zone 'Europe/Madrid'),'programada') returning id`);
const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-ES" });
await desk.addCookies([sessionCookie(U)]);
const p2 = await desk.newPage();
await p2.goto(`${base}/calendario?v=mes&d=${tomorrow}`, { waitUntil: "networkidle" });
const chip = p2.getByText("📣 Post calendario");
ok(await chip.isVisible(), "la publicación sale en el Calendario");
const handle = p2.getByLabel("Arrastrar a otro día").first();
const target = p2.getByRole("button", { name: new RegExp(`^\\w+ ${Number(after.slice(8))} de`) }).first();
const hb = await handle.boundingBox(), tb = await target.boundingBox();
await p2.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await p2.mouse.down();
await p2.mouse.move(hb.x + 20, hb.y + 5, { steps: 5 });
await p2.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 15 });
await p2.mouse.up();
await p2.waitForTimeout(2000);
const moved = sql(`select (scheduled_at at time zone 'Europe/Madrid')::date::text || ' ' || to_char(scheduled_at at time zone 'Europe/Madrid','HH24:MI') from social_posts where id='${post}'`);
ok(moved === `${after} 18:00`, `arrastrar cambia el día y conserva la hora (${moved})`);
await browser.close();

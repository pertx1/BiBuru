// TikTok de negocio: publicación asistida (app sin permisos de publicar) a través del cron real, y su página.
// Uso: USER_ID=<uuid> node scripts/e2e/tiktok-business.mjs  (con scripts/e2e/up.sh)
import { execSync } from "node:child_process";
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const U = process.env.USER_ID;
const sql = (s) => execSync(`psql -h localhost -U postgres -d biburu_test -Atc "${s.replace(/"/g, '\\"')}"`, { env: { ...process.env, PGPASSWORD: "postgres" } }).toString().trim().split("\n")[0];
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };
const ws = sql(`select default_workspace_id from profiles where user_id='${U}'`);
sql(`delete from social_accounts where workspace_id='${ws}'`); sql(`delete from social_posts where workspace_id='${ws}'`);
const acc = sql(`insert into social_accounts (workspace_id,user_id,platform,external_id,username,access_token_enc,token_expires_at,scopes) values ('${ws}','${U}','tiktok','open1','akerra_tt','x',now()+interval '1 day','user.info.basic,video.list') returning id`);
const post = sql(`insert into social_posts (workspace_id,user_id,title,caption,hashtags,media_kind,scheduled_at,status) values ('${ws}','${U}','Vídeo otoño','Mira la nueva colección','#moda','reel',now()-interval '1 minute','programada') returning id`);
const target = sql(`insert into social_post_targets (workspace_id,user_id,post_id,account_id,mode) values ('${ws}','${U}','${post}','${acc}','assisted') returning id`);

const res = execSync(`curl -s -X POST -H "Authorization: Bearer test-cron-secret-0123456789abcdef" http://localhost:3100/api/cron/social`).toString();
ok(/"done":true/.test(res), `cron de redes responde (${res})`);
ok(sql(`select status from social_post_targets where id='${target}'`) === "avisada", "a la hora programada, aviso de publicación asistida");
ok(sql(`select status from social_posts where id='${post}'`) === "publicada", "la publicación pasa a «Publicada» (aviso enviado)");
execSync(`curl -s -X POST -H "Authorization: Bearer test-cron-secret-0123456789abcdef" http://localhost:3100/api/cron/social`);
ok(sql(`select count(*) from notification_log where dedupe_key='social:${target}'`) === "1", "el aviso no se repite en la siguiente pasada");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES" });
await ctx.addCookies([sessionCookie(U)]);
const page = await ctx.newPage();
await page.goto(`http://localhost:3100/redes/publicar/${post}`, { waitUntil: "networkidle" });
ok(await page.getByRole("heading", { name: "Publicar en TikTok" }).isVisible(), "página de publicación asistida");
await page.goto(`http://localhost:3100/redes`, { waitUntil: "networkidle" });
ok(await page.getByText(/App sin auditar: lo que se publique por API quedaría privado/).isVisible(), "explica en pantalla que sin auditoría sería privado");
await page.goto(`http://localhost:3100/redes?vista=publicaciones`, { waitUntil: "networkidle" });
ok(await page.getByText(/quedaría|queda <strong>privado|privado \(solo tú lo ves\)/).first().isVisible(), "aviso de privacidad en Publicaciones");
await browser.close();

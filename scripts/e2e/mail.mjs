// Correo: estado «Falta conectar» sin claves, bandeja con cabeceras (sembradas en la BD), filtros y widget.
// Uso: USER_ID=<uuid> node scripts/e2e/mail.mjs  (con scripts/e2e/up.sh; sin claves de Microsoft)
import { execSync } from "node:child_process";
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const U = process.env.USER_ID;
const sql = (s) => execSync(`psql -h localhost -U postgres -d biburu_test -Atc "${s.replace(/"/g, '\\"')}"`, { env: { ...process.env, PGPASSWORD: "postgres" } }).toString().trim();
const base = "http://localhost:3100";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES" });
await ctx.addCookies([sessionCookie(U)]);
const page = await ctx.newPage();
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };

sql(`delete from mail_accounts where user_id='${U}'`);
await page.goto(`${base}/correo`, { waitUntil: "networkidle" });
ok(await page.getByText("Falta conectar").isVisible(), "sin claves de Microsoft: «Falta conectar»");
await page.goto(`${base}/ajustes#correo`, { waitUntil: "networkidle" });
ok(await page.getByText("Usar la IA con mis correos").isVisible(), "Ajustes: opción de IA (apagada) con explicación");
ok(!(await page.getByLabel(/Usar la IA/).isChecked().catch(() => false)), "IA con correos apagada por defecto");

const ws = sql(`select default_workspace_id from profiles where user_id='${U}'`);
const acc = sql(`insert into mail_accounts (user_id,workspace_id,email,refresh_token_enc) values ('${U}','${ws}','yo@outlook.es','x') returning id`).split("\n")[0];
sql(`insert into mail_messages (user_id,workspace_id,account_id,graph_id,from_name,from_address,subject,preview,received_at,is_read,has_attachments) values
  ('${U}','${ws}','${acc}','g1','Imprenta Sol','pedidos@imprenta.es','Presupuesto camisetas','Te paso el presupuesto de 200 camisetas',now(),false,true),
  ('${U}','${ws}','${acc}','g2','Ana','ana@x.es','Gracias por el pedido','Me ha encantado',now() - interval '1 day',true,false)`);
await page.goto(`${base}/correo`, { waitUntil: "networkidle" });
ok(await page.getByText("Presupuesto camisetas").isVisible() && await page.getByText("Gracias por el pedido").isVisible(), "bandeja unificada con remitente, asunto y vista previa");
ok(await page.getByText("1 sin leer").isVisible(), "contador de no leídos");
await page.getByRole("button", { name: "No leídos" }).click();
await page.waitForURL(/filtro=no-leidos/);
ok(!(await page.getByText("Gracias por el pedido").isVisible()), "filtro «No leídos»");
await page.getByLabel("Buscar correos").fill("presupuesto");
await page.getByLabel("Buscar correos").press("Enter");
await page.waitForURL(/q=presupuesto/);
ok(await page.getByText("Presupuesto camisetas").isVisible(), "buscador");
await page.getByText("Presupuesto camisetas").click();
ok(await page.getByText(/No hay acceso a la cuenta|No se pudo abrir/).isVisible({ timeout: 10000 }).catch(() => false) || await page.getByRole("dialog").isVisible(), "abrir un correo pide el cuerpo a Microsoft (aquí sin acceso: aviso claro)");
ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "sin scroll horizontal");
sql(`delete from mail_accounts where user_id='${U}'`);
await browser.close();

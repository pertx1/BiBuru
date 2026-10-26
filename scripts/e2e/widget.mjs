// Widgets de iPhone: generar el código en Ajustes, copiarlo y ejecutarlo en un Scriptable simulado contra la app real.
// Uso: USER_ID=<uuid> node scripts/e2e/widget.mjs  (con scripts/e2e/up.sh levantado)
import pg from "pg";
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const base = "http://localhost:3100";
const db = new pg.Client({ connectionString: "postgres://postgres:postgres@localhost:5432/biburu_test" });
await db.connect();
const q = (s, p) => db.query(s, p);
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };
const U = process.env.USER_ID;
const ws = (await q("select default_workspace_id id from profiles where user_id=$1", [U])).rows[0].id;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
await q("delete from widget_tokens where user_id=$1", [U]);
await q("delete from tasks where workspace_id=$1", [ws]);
await q("insert into tasks (workspace_id,user_id,title,due_date,due_time) values ($1,$2,'Llamar a la imprenta',$3,'10:00'),($1,$2,'Factura septiembre',$3::date - 2,null)", [ws, U, today]);
const biz = (await q("insert into businesses (workspace_id,user_id,name) values ($1,$2,'Widget SL') returning id", [ws, U])).rows[0].id;
const o = (await q("insert into orders (workspace_id,user_id,business_id,order_date,status) values ($1,$2,$3,$4,'sin_hacer') returning id", [ws, U, biz, today])).rows[0].id;
await q("insert into order_items (workspace_id,user_id,order_id,product_name,quantity,unit_price_cents) values ($1,$2,$3,'Camiseta',2,1995)", [ws, U, o]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", permissions: ["clipboard-read", "clipboard-write"] });
await ctx.addCookies([sessionCookie(U)]);
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${base}/ajustes#widgets`, { waitUntil: "networkidle" });
ok(await page.getByRole("heading", { name: "Widgets de iPhone" }).isVisible(), "sección en Ajustes");
await page.getByRole("button", { name: "Generar el código del widget" }).click();
await page.getByRole("button", { name: "Copiar código" }).click();
const code = await page.evaluate(() => navigator.clipboard.readText());
ok(code.includes("ListWidget") && code.includes(`const URL_BASE = "${base}"`) && /const CLAVE = "bw_/.test(code), "copia el código con la dirección y la clave");
await page.screenshot({ path: process.env.SHOT ?? "/tmp/widget.png", fullPage: false });

// Ejecutar el código como lo haría Scriptable en el iPhone, contra la app de verdad.
// (Node quita los tipos del .ts al importarlo; el mismo simulador que usan los tests.)
const { runInScriptable: run } = await import("../../src/lib/widget/scriptable-mock.ts");
const fetchJson = async (url, headers) => { const r = await fetch(url, { headers }); return { status: r.status, body: await r.json() }; };
const p = await run(code, { family: "medium", fetchJson });
const t = p.texts.join(" | ");
ok(/Hoy · 1 tarea \|/.test(t) && t.includes("10:00 Llamar a la imprenta") && t.includes("Atrasadas"), `tareas de hoy y atrasadas: ${t.slice(0, 120)}`);
ok(/Ventas hoy \| 39,90/.test(t) && t.includes("Pedidos sin hacer | 1"), "ventas y pedidos reales");
ok((await q("select last_used_at from widget_tokens where user_id=$1", [U])).rows[0].last_used_at !== null, "anota cuándo pidió datos");

// Desactivar: deja de dar datos.
page.on("dialog", (d) => d.accept());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: "Desactivar" }).click();
await page.getByText("Widget desactivado").waitFor();
const off = await run(code, { fetchJson });
ok(off.texts.some((x) => /Clave no válida/.test(x)), "desactivado: el widget lo dice");
ok((await fetch(`${base}/api/widget`)).status === 401, "sin clave: 401");
ok(errors.length === 0, `sin errores de JavaScript ${errors.join(" | ")}`);
await browser.close(); await db.end();

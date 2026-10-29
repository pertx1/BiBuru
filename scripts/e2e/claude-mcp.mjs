// Conector de Claude (MCP): generar la dirección en Ajustes y usarla como lo hacen claude.ai y Claude Code
// (initialize → tools/list → tools/call). Comprueba que lo «a medias» sale en Proyectos y Tareas, y el borrado de vacías.
// Uso: USER_ID=<uuid> node scripts/e2e/claude-mcp.mjs  (con scripts/e2e/up.sh levantado)
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
await q("delete from mcp_tokens where user_id=$1", [U]);
await q("delete from tasks where workspace_id=$1", [ws]);
await q("delete from notes where workspace_id=$1", [ws]);
await q("delete from video_categories where workspace_id=$1 and name in ('Pendiente de Claude','Shopify','Agentes','Vacía vieja')", [ws]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", permissions: ["clipboard-read", "clipboard-write"] });
await ctx.addCookies([sessionCookie(U)]);
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
await page.goto(`${base}/ajustes#claude`, { waitUntil: "networkidle" });
ok(await page.getByRole("heading", { name: "Conectar Claude" }).isVisible(), "sección en Ajustes");
await page.getByRole("button", { name: "Generar dirección para Claude" }).click();
await page.getByRole("button", { name: "Copiar dirección" }).click();
const url = await page.evaluate(() => navigator.clipboard.readText());
ok(new RegExp(`^${base}/api/mcp/bm_[A-Za-z0-9_-]{30,}$`).test(url), `dirección con clave: ${url.slice(0, 50)}…`);
ok(await page.getByText(`claude mcp add --transport http --scope user biburu ${url}`).isVisible(), "comando para Claude Code");
await page.screenshot({ path: process.env.SHOT ?? "/tmp/claude-mcp.png", fullPage: false });

// Como Claude: sin cookies, solo la dirección.
let id = 0;
const rpc = async (method, params, target = url, headers = {}) => {
  const r = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "User-Agent": "Claude-User", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  return { status: r.status, body: r.status === 202 ? null : await r.json() };
};
const callTool = async (name, args) => { const r = await rpc("tools/call", { name, arguments: args }); return r.body.result; };
const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-ai", version: "1" } });
ok(init.status === 200 && init.body.result.serverInfo.name === "BiBuru" && /apuntar_pendiente/.test(init.body.result.instructions), "initialize");
ok((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) })).status === 202, "notificación → 202");
const list = (await rpc("tools/list")).body.result.tools.map((t) => t.name);
ok(["crear_tarea", "apuntar_pendiente", "listar_tareas", "completar_tarea", "crear_nota", "ver_proyecto", "buscar"].every((n) => list.includes(n)), `herramientas: ${list.join(", ")}`);

const t1 = await callTool("crear_tarea", { titulo: "Llamar al proveedor de DTF", fecha: "mañana", hora: "10:00", prioridad: "alta", proyecto: "Posibles negocios › Shopify" });
ok(!t1.isError && /Tarea creada/.test(t1.content[0].text) && /Shopify \(proyecto nuevo\)/.test(t1.content[0].text), t1.content[0].text.split("\n")[0]);
const row = (await q("select t.*, c.name cat from tasks t left join video_categories c on c.id=t.category_id where t.workspace_id=$1 and t.title='Llamar al proveedor de DTF'", [ws])).rows[0];
ok(row && row.cat === "Shopify" && row.priority === 3 && row.due_time === "10:00:00" && row.remind_at !== null, "guardada con proyecto, prioridad, hora y aviso");

const p1 = await callTool("apuntar_pendiente", { titulo: "Terminar conector de Shopify", que_falta: "- Probar pedidos\n- Desplegar", contexto: "Rama feat/shopify", origen: "Claude Code", enlace: "https://github.com/x/y/pull/3" });
ok(!p1.isError && /Pendiente de Claude/.test(p1.content[0].text), p1.content[0].text.split("\n")[0]);
const p2 = await callTool("apuntar_pendiente", { titulo: "terminar conector de shopify", que_falta: "- Solo desplegar" });
ok(/Actualizado/.test(p2.content[0].text), "mismo título: actualiza en vez de duplicar");
const pend = (await q("select t.notes, c.pinned from tasks t join video_categories c on c.id=t.category_id where t.workspace_id=$1 and c.name='Pendiente de Claude'", [ws])).rows;
ok(pend.length === 1 && pend[0].pinned && pend[0].notes.startsWith("Dejado a medias en Claude el") && pend[0].notes.includes("Rama feat/shopify"), "una tarea en «Pendiente de Claude» (fijado) con el historial");

const n1 = await callTool("crear_nota", { titulo: "Ideas Shopify", contenido: "# Ideas\n- Tienda de camisetas DTF", proyecto: "Shopify" });
ok(!n1.isError && /en Posibles negocios › Shopify/.test(n1.content[0].text), "nota en el proyecto existente (por nombre)");
const vp = (await callTool("ver_proyecto", { proyecto: "Posibles negocios" })).content[0].text;
ok(vp.includes("Llamar al proveedor de DTF") && vp.includes("Ideas Shopify") && vp.includes("Subproyectos: Shopify"), "ver_proyecto incluye subproyectos");
const lt = (await callTool("listar_tareas", { filtro: "sin_fecha", proyecto: "Pendiente de Claude", con_notas: true })).content[0].text;
ok(lt.includes("Terminar conector de Shopify") && lt.includes("Solo desplegar"), "listar_tareas por proyecto");
const res = (await callTool("resumen_de_hoy", {})).content[0].text;
ok(/Pendiente de Claude \(1\)/.test(res) && /Ventas hoy/.test(res), "resumen de hoy");
const taskId = /id: ([0-9a-f-]{36})/.exec(t1.content[0].text)[1];
ok(!(await callTool("editar_tarea", { id: taskId, fecha: "ninguna", anadir_a_notas: "Pedir precio" })).isError, "editar_tarea");
ok((await q("select due_date, remind_at, notes from tasks where id=$1", [taskId])).rows[0].due_date === null, "sin fecha tras editar");
ok(/completada/.test((await callTool("completar_tarea", { id: taskId })).content[0].text), "completar_tarea");
ok((await callTool("crear_tarea", { titulo: "X", fecha: "cuando sea" })).isError, "fecha que no entiende → error legible");
ok((await callTool("completar_tarea", { id: "00000000-0000-0000-0000-000000000000" })).isError, "tarea de otro/inexistente → error");

// Bearer (Claude Code con --header) y claves malas.
const token = url.split("/").pop();
ok((await rpc("ping", {}, `${base}/api/mcp`, { Authorization: `Bearer ${token}` })).status === 200, "también con Authorization: Bearer");
ok((await rpc("ping", {}, `${base}/api/mcp/bm_${"x".repeat(40)}`)).status === 401, "clave inventada → 401");
ok((await fetch(url)).status === 405, "GET → 405 (sin SSE)");
ok((await q("select last_client from mcp_tokens where user_id=$1", [U])).rows[0].last_client === "Claude-User", "apunta el último cliente");

// Lo pendiente se ve en Proyectos y en Tareas → Bandeja.
await page.goto(`${base}/proyectos`, { waitUntil: "networkidle" });
ok(await page.locator("main span").filter({ hasText: "Pendiente de Claude" }).first().isVisible(), "«Pendiente de Claude» en Proyectos");
await page.goto(`${base}/tareas?f=bandeja`, { waitUntil: "networkidle" });
ok(await page.locator("main").getByText("Terminar conector de Shopify").isVisible(), "y en Tareas → Bandeja");

// Borrar vacías: una categoría vieja sin nada desaparece; las que tienen cosas o descripción se quedan.
await q("insert into video_categories (workspace_id,user_id,name,created_at) values ($1,$2,'Vacía vieja',now() - interval '3 days')", [ws, U]);
await page.goto(`${base}/favoritos`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Categorías|Gestionar/ }).first().click();
await page.getByRole("button", { name: "Borrar vacías" }).click();
await page.waitForTimeout(1500);
const names = (await q("select name from video_categories where workspace_id=$1", [ws])).rows.map((r) => r.name);
ok(!names.includes("Vacía vieja") && names.includes("Pendiente de Claude") && names.includes("Shopify"), "borrar vacías");

// Desconectar: la dirección deja de valer.
await page.goto(`${base}/ajustes#claude`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Desconectar" }).click();
await page.getByText("Claude desconectado").waitFor();
ok((await rpc("ping", {})).status === 401, "desconectado → 401");
ok(errors.length === 0, `sin errores de JavaScript ${errors.join(" | ")}`);
await browser.close(); await db.end();

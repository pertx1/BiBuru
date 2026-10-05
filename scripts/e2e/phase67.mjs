// Recorrido de las fases 6 (IA) y 7 (Favoritos) con un Gemini falso que habla el formato real de la API.
import crypto from "node:crypto";
import pg from "pg";
import { chromium } from "playwright-core";
import { startFakeGemini } from "./fake-gemini.mjs";
import { sessionCookie } from "./session.mjs";

const out = process.env.OUT ?? "/tmp/shots67";
const base = "http://localhost:3100";
const USER_ID = process.env.USER_ID;
const CRON = "test-cron-secret-0123456789abcdef";
const db = new pg.Client({ connectionString: "postgres://postgres:postgres@localhost:5432/biburu_test" });
await db.connect();
const q = (s, p) => db.query(s, p);
const ws = (await q("select default_workspace_id from profiles where user_id=$1", [USER_ID])).rows[0].default_workspace_id;
const fake = await startFakeGemini();
let fails = 0;
const check = (name, ok, extra = "") => { console.log(ok ? "✔" : "✘ FALLA", name, extra); if (!ok) fails++; };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "es-ES" });
await ctx.addCookies([sessionCookie(USER_ID)]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text().slice(0, 200)));
const settle = async () => { await page.waitForSelector("h1, h2", { timeout: 8000 }); await page.waitForTimeout(600); };
const main = async () => { await settle(); return (await page.locator("main").innerText()).replace(/\s+/g, " "); };
const post = (path) => fetch(base + path, { method: "POST", headers: { Authorization: `Bearer ${CRON}` } }).then((r) => r.json());

// ------------------------------------------------------------------ Fase 6: captura → propuesta → aceptar
await q("insert into businesses (workspace_id,user_id,name) select $1,$2,'Akerra' where not exists (select 1 from businesses where workspace_id=$1 and name='Akerra')", [ws, USER_ID]);
await page.goto(base + "/"); await settle();
await page.getByRole("button", { name: "Captura rápida" }).click();
check("el panel de captura tiene botón de dictado", await page.getByRole("button", { name: "Dictar por voz" }).count() === 1);
await page.getByLabel("Texto de la captura").fill("Comprar etiquetas para las camisetas mañana a las 9");
await page.keyboard.press("Enter");
await page.waitForTimeout(2500);
await page.goto(base + "/bandeja");
let t = await main();
check("la IA propone una tarea en la bandeja", /Comprar etiquetas/.test(t) && /Aceptar/.test(t), t.slice(0, 160));
await page.screenshot({ path: `${out}/1-bandeja-propuesta.png` });
await page.getByRole("button", { name: /^Aceptar/ }).first().click();
await page.waitForTimeout(1500);
check("aceptar crea la tarea", (await q("select 1 from tasks where title like 'Comprar etiquetas%' and workspace_id=$1", [ws])).rowCount === 1);

// gasto: nunca se crea solo
await page.getByRole("button", { name: "Captura rápida" }).click();
await page.getByLabel("Texto de la captura").fill("Gasto de 42,50 euros en etiquetas");
await page.keyboard.press("Enter");
await page.waitForTimeout(2500);
await page.goto(base + "/bandeja");
t = await main();
check("el gasto queda propuesto, no creado", /Confirmar/.test(t) && (await q("select 1 from expenses where workspace_id=$1", [ws])).rowCount === 0, t.slice(0, 200));
await page.screenshot({ path: `${out}/2-bandeja-gasto.png` });

// ------------------------------------------------------------------ Fase 6: chat con herramientas
await page.goto(base + "/chat"); await settle();
await page.getByLabel("Mensaje").fill("¿Qué tareas tengo mañana?");
await page.getByRole("button", { name: "Enviar" }).click();
await page.waitForSelector("text=1 tarea", { timeout: 15000 }).catch(() => {});
t = await main();
check("el chat responde usando la herramienta list_tasks", /1 tarea/.test(t), t.slice(-160));
check("el modelo recibió las herramientas y el resultado", fake.requests.some((r) => r.body.contents?.some((c) => c.parts?.some((p) => p.functionResponse))));
await page.screenshot({ path: `${out}/3-chat.png` });

// ------------------------------------------------------------------ Fase 7: favoritos
const vid = (o) => q(`insert into saved_videos (workspace_id,user_id,source,external_id,url,title,channel,duration_sec,thumbnail_url,analysis_status,added_via) values ($1,$2,$3,$4,$5,$6,$7,$8,null,$9,'manual') returning id`, [ws, USER_ID, o.source, o.ext ?? null, o.url, o.title, o.channel, o.dur ?? null, o.status ?? "pending"]).then((r) => r.rows[0].id);
const vShort = await vid({ source: "youtube", ext: "aaaaaaaaaaa", url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", title: "Anuncios cortos para marcas de ropa", channel: "Marketing Ropa", dur: 600 });
const vLong = await vid({ source: "youtube", ext: "bbbbbbbbbbb", url: "https://www.youtube.com/watch?v=bbbbbbbbbbb", title: "Curso completo de tiendas online (3 horas)", channel: "Ecommerce Pro", dur: 10800, status: "needs_confirm" });
const vTik = await vid({ source: "tiktok", ext: "7234567890123456789", url: "https://www.tiktok.com/@akerra/video/7234567890123456789", title: "Cómo doblamos las camisetas", channel: "akerra" });

// cola de análisis por cron (con la clave de servicio y el Gemini falso)
const r1 = await post("/api/cron/videos");
check("cron/videos analiza los pendientes", r1.ok && r1.ready === 2, JSON.stringify(r1));
const yt = fake.requests.find((r) => r.body.contents?.some((c) => c.parts?.some((p) => p.fileData?.fileUri?.includes("aaaaaaaaaaa"))));
check("YouTube se envía a Gemini por su URL (fileData)", !!yt);
const tk = fake.requests.filter((r) => r.system.includes("analista")).find((r) => JSON.stringify(r.body).includes("7234567890123456789"));
check("TikTok se analiza solo con texto (sin fileData)", !!tk && !JSON.stringify(tk.body).includes("fileData"));
const rows = (await q("select id, analysis_status, analysis_mode, utility, category_id, business_id from saved_videos where workspace_id=$1 order by created_at", [ws])).rows;
check("el largo espera confirmación (no se analizó solo)", rows.find((r) => r.id === vLong).analysis_status === "needs_confirm");
check("clasificado con categoría y negocio", rows.find((r) => r.id === vShort).category_id && rows.find((r) => r.id === vShort).business_id);
check("la categoría se creó una vez y se reutiliza", (await q("select count(*)::int n from video_categories where workspace_id=$1", [ws])).rows[0].n === 1);
check("el consumo queda registrado", Number((await q("select coalesce(sum(cost_micros),0) s from ai_usage where workspace_id=$1 and feature like 'video%'", [ws])).rows[0].s) > 0);

await page.goto(base + "/favoritos"); t = await main();
check("Favoritos lista los vídeos por ver", /Anuncios cortos/.test(t) && /Cómo doblamos/.test(t) && /confirma el análisis/.test(t), t.slice(0, 200));
await page.screenshot({ path: `${out}/4-favoritos.png` });
await page.getByRole("button", { name: /Anuncios cortos/ }).click(); await page.waitForTimeout(500);
t = (await page.locator("dialog[open]").innerText()).replace(/\s+/g, " ");
check("la ficha muestra resumen, puntos, ideas y negocio", /Resumen/.test(t) && /Puntos clave/.test(t) && /Ideas para aplicar/.test(t) && /Akerra/.test(t));
await page.screenshot({ path: `${out}/5-ficha-video.png` });
await page.getByRole("button", { name: /Convertir en tarea/ }).click(); await page.waitForTimeout(1200);
check("Convertir en tarea", (await q("select notes from tasks where title like 'Aplicar:%' and workspace_id=$1", [ws])).rows[0]?.notes?.includes("Preparar 3 anuncios"));
await page.getByRole("button", { name: /Guardar como nota/ }).click(); await page.waitForTimeout(1200);
check("Guardar como nota", (await q("select 1 from notes where title like 'Anuncios cortos%' and workspace_id=$1", [ws])).rowCount === 1);
await page.getByLabel("Cerrar").click();

// vídeo largo: coste estimado y confirmación
await page.getByRole("button", { name: /Curso completo/ }).click(); await page.waitForTimeout(500);
t = (await page.locator("dialog[open]").innerText()).replace(/\s+/g, " ");
check("el largo muestra duración y coste estimado", /3:00:00/.test(t) && /€/.test(t), t.slice(0, 220));
await page.screenshot({ path: `${out}/6-video-largo.png` });
await page.getByRole("button", { name: /Análisis ligero/ }).click(); await page.waitForTimeout(2500);
const long = (await q("select analysis_status, analysis_mode from saved_videos where id=$1", [vLong])).rows[0];
check("el análisis ligero usa solo texto", long.analysis_status === "ready" && long.analysis_mode === "light", JSON.stringify(long));
await page.goto(base + "/favoritos"); await settle();

// estado, filtros y categorías
await page.getByRole("button", { name: /Anuncios cortos/ }).click(); await page.waitForTimeout(400);
await page.locator("dialog[open] select").first().selectOption("visto"); await page.waitForTimeout(1200);
check("cambiar estado a Visto", (await q("select status from saved_videos where id=$1", [vShort])).rows[0].status === "visto");
await page.keyboard.press("Escape");
await page.goto(base + "/favoritos?estado=visto"); t = await main();
check("el filtro Visto muestra solo ese", /Anuncios cortos/.test(t) && !/Cómo doblamos/.test(t));
await page.goto(base + "/favoritos?estado=todos&q=calendario%20semanal"); t = await main();
check("la búsqueda encuentra por el resumen", /Anuncios cortos/.test(t));
await page.goto(base + "/favoritos"); await settle();
await page.getByRole("button", { name: "Categorías" }).click(); await page.waitForTimeout(400);
await page.getByLabel("Nueva categoría").fill("Ventas"); await page.getByRole("button", { name: "Crear" }).click(); await page.waitForTimeout(1000);
check("crear categoría", (await q("select 1 from video_categories where name='Ventas' and workspace_id=$1", [ws])).rowCount === 1);
await page.screenshot({ path: `${out}/7-categorias.png` });
page.once("dialog", (d) => d.accept());
await page.getByLabel("Fusionar Ventas en…").selectOption({ label: "Marketing" }); await page.waitForTimeout(1200);
check("fusionar categorías", (await q("select count(*)::int n from video_categories where workspace_id=$1", [ws])).rows[0].n === 1);

// búsqueda global
await page.keyboard.press("Escape");

// ------------------------------------------------------------------ Ajustes: IA y YouTube
await page.goto(base + "/ajustes"); t = await main();
check("Ajustes muestra IA y YouTube", /Inteligencia artificial/.test(t) && /Este mes:/.test(t) && /Conectar con Google/.test(t), t.slice(0, 120));
await page.screenshot({ path: `${out}/8-ajustes.png`, fullPage: true });

// presupuesto: al llegar al 100 % la IA se pausa y la captura sigue
await q("update profiles set ai_monthly_budget_cents=1 where user_id=$1", [USER_ID]);
await page.goto(base + "/favoritos"); t = await main();
check("aviso de presupuesto agotado", /presupuesto de IA/.test(t));
await page.screenshot({ path: `${out}/9-presupuesto-agotado.png` });
await q("update profiles set ai_monthly_budget_cents=1000 where user_id=$1", [USER_ID]);

check("sin errores de consola/página", errors.length === 0, errors.slice(0, 3).join(" | "));
console.log(fails === 0 ? "\nTODO OK" : `\n${fails} comprobaciones fallaron`);
fake.close(); await browser.close(); await db.end();
process.exit(fails ? 1 : 0);

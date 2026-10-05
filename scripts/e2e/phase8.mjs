// Recorrido de la Fase 8: Inicio completo, exportación, borrado de cuenta (validación) y lectura sin conexión.
import fs from "node:fs";
import pg from "pg";
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const out = process.env.OUT ?? "/tmp/shots8";
const base = "http://localhost:3100";
const USER_ID = process.env.USER_ID;
const db = new pg.Client({ connectionString: "postgres://postgres:postgres@localhost:5432/biburu_test" });
await db.connect();
const q = (s, p) => db.query(s, p);
const ws = (await q("select default_workspace_id from profiles where user_id=$1", [USER_ID])).rows[0].default_workspace_id;
let fails = 0;
const check = (name, ok, extra = "") => { console.log(ok ? "✔" : "✘ FALLA", name, extra); if (!ok) fails++; };

// datos de ejemplo para un Inicio realista
const biz = (await q("select id, name from businesses where workspace_id=$1 order by name limit 2", [ws])).rows;
const today = new Date().toISOString().slice(0, 10);
const b0 = biz[0]?.id ?? null;
await q("insert into tasks (workspace_id,user_id,title,due_date,due_time,priority,business_id) values ($1,$2,'Pedir etiquetas al proveedor',$3,'10:30',3,$4),($1,$2,'Subir fotos de la colección nueva',$3,null,2,$4),($1,$2,'Llamar a la imprenta',$5,null,1,$4)", [ws, USER_ID, today, b0, new Date(Date.now() - 86400000).toISOString().slice(0, 10)]);
await q("insert into events (workspace_id,user_id,title,start_date,end_date,start_time,end_time,all_day,business_id) values ($1,$2,'Reunión con el diseñador',$3,$3,'12:00','13:00',false,$4)", [ws, USER_ID, today, b0]);
await q("insert into goals (workspace_id,user_id,title,measure_type,target_value,current_value,business_id,deadline) values ($1,$2,'Vender 200 camisetas este trimestre','number',20000,7500,$3,$4)", [ws, USER_ID, b0, new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)]);
await q("insert into inbox_items (workspace_id,user_id,client_id,raw_text,source) values ($1,$2,gen_random_uuid(),'Idea: pack de verano','text')", [ws, USER_ID]);
await q("insert into saved_videos (workspace_id,user_id,source,url,title,channel,analysis_status,summary,utility) values ($1,$2,'youtube','https://www.youtube.com/watch?v=zzzzzzzzzzz','Cómo fotografiar ropa con el móvil','Foto Tips','ready','Guía rápida de iluminación.',4) on conflict do nothing", [ws, USER_ID]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "es-ES", acceptDownloads: true });
await ctx.addCookies([sessionCookie(USER_ID)]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text()) && errors.push("console: " + m.text().slice(0, 200)));
const settle = async () => { await page.waitForSelector("h1, h2", { timeout: 8000 }); await page.waitForTimeout(700); };

// ---- Inicio
let t0 = Date.now();
await page.goto(base + "/"); await settle();
console.log("Inicio cargado en ms:", Date.now() - t0);
let t = (await page.locator("main").innerText()).replace(/\s+/g, " ");
check("Inicio: captura arriba", await page.getByRole("button", { name: /Apunta una idea/ }).count() === 1);
check("Inicio: tareas de hoy y atrasadas", /Pedir etiquetas/.test(t) && /atrasadas/i.test(t) && /Llamar a la imprenta/.test(t));
check("Inicio: evento de hoy", /Reunión con el diseñador/.test(t));
check("Inicio: tarjetas de negocio con cifras", /Negocios este mes/.test(t) && /Beneficio/.test(t));
check("Inicio: objetivos", /Vender 200 camisetas/.test(t));
check("Inicio: bandeja y vídeos pendientes", /por revisar/.test(t) && /vídeo sin revisar/.test(t));
await page.screenshot({ path: `${out}/1-inicio-movil.png`, fullPage: true });
await page.getByRole("button", { name: /Apunta una idea/ }).click();
check("la barra de Inicio abre la captura", await page.getByLabel("Texto de la captura").count() === 1);
await page.keyboard.press("Escape");
const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "es-ES" });
await desk.addCookies([sessionCookie(USER_ID)]);
const dp = await desk.newPage();
await dp.goto(base + "/"); await dp.waitForSelector("h1"); await dp.waitForTimeout(800);
await dp.screenshot({ path: `${out}/2-inicio-escritorio.png`, fullPage: true });

// ---- exportación
const json = await ctx.request.get(base + "/api/export?formato=json");
const body = await json.json();
check("export JSON con todas las tablas", json.ok() && body.data.tasks.length >= 3 && Array.isArray(body.data.saved_videos) && !("integrations" in body.data) && !("push_subscriptions" in body.data), Object.keys(body.data).length + " tablas");
check("export JSON: cabecera de descarga", /attachment; filename="biburu-\d{4}-\d{2}-\d{2}\.json"/.test(json.headers()["content-disposition"] ?? ""));
const csv = await ctx.request.get(base + "/api/export?formato=csv&conjunto=tareas");
const csvText = await csv.text();
check("export CSV (BOM, separador ;)", csv.ok() && csvText.startsWith("﻿") && csvText.split("\r\n")[0].includes(";") && /Pedir etiquetas/.test(csvText));
check("export CSV rechaza conjuntos desconocidos", (await ctx.request.get(base + "/api/export?formato=csv&conjunto=integrations")).status() === 400);
const anon = await (await browser.newContext()).request.get(base + "/api/export?formato=json", { maxRedirects: 0 });
check("exportar sin sesión no devuelve datos", anon.status() !== 200, String(anon.status()));

// ---- borrado de cuenta (validación; el borrado en cascada lo prueban los tests de base de datos)
await page.goto(base + "/ajustes"); await settle();
await page.getByText("Borrar mi cuenta y todos mis datos").click();
const del = page.getByRole("button", { name: "Borrar definitivamente" });
check("borrar cuenta: desactivado hasta escribir el correo", await del.isDisabled());
await page.getByLabel("Escribe tu correo para confirmar").fill("yo@example.com");
check("borrar cuenta: se activa con el correo exacto", await del.isEnabled());
await page.getByLabel("Escribe tu correo para confirmar").fill("");
await page.screenshot({ path: `${out}/3-ajustes-datos.png`, fullPage: true });

// ---- lectura sin conexión
await page.goto(base + "/tareas"); await settle();
await page.goto(base + "/favoritos"); await settle();
await page.goto(base + "/"); await settle();
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload(); await settle();           // ya controlado por el service worker
await page.goto(base + "/tareas"); await settle(); // y cacheado con él
await ctx.setOffline(true);
await page.evaluate(() => window.dispatchEvent(new Event("offline")));
await page.goto(base + "/tareas").catch(() => {});
await page.waitForTimeout(800);
t = (await page.locator("body").innerText()).replace(/\s+/g, " ");
check("sin conexión: se lee la última página cargada", /Pedir etiquetas/.test(t), t.slice(0, 100));
check("sin conexión: aviso visible", /Sin conexión: ves lo último cargado/.test(t));
await page.screenshot({ path: `${out}/4-sin-conexion.png` });
await page.goto(base + "/negocios").catch(() => {});
await page.waitForTimeout(600);
t = (await page.locator("body").innerText()).replace(/\s+/g, " ");
check("sin conexión: página no visitada → pantalla offline", /conexión/i.test(t) && !/Negocios este mes/.test(t), t.slice(0, 80));
await ctx.setOffline(false);
await ctx.clearCookies(); // como tras cerrar sesión
await page.goto(base + "/login").catch(() => {});
await page.waitForTimeout(800);
const left = await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith("biburu-pages")).length ? (await (await caches.open((await caches.keys()).find((k) => k.startsWith("biburu-pages")))).keys()).length : 0);
check("al abrir /login se borran las copias sin conexión", left === 0, String(left));

check("sin errores de consola/página", errors.length === 0, errors.slice(0, 3).join(" | "));
console.log(fails === 0 ? "\nTODO OK" : `\n${fails} comprobaciones fallaron`);
await browser.close(); await db.end();
process.exit(fails ? 1 : 0);

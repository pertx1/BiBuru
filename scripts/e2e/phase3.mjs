// Recorrido de la Fase 3: tareas (alta rápida, recurrencia, posponer), calendario y objetivos.
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const out = process.env.OUT ?? "/tmp/shots3";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "es-ES" });
await ctx.addCookies([sessionCookie(process.env.USER_ID)]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const base = "http://localhost:3100";
const text = async () => (await page.locator("main").innerText()).replace(/\s+/g, " ");

// ---- Tareas: alta rápida
await page.goto(base + "/tareas");
const add = async (t) => { await page.getByLabel("Nueva tarea", { exact: true }).fill(t); await page.keyboard.press("Enter"); await page.waitForTimeout(900); };
await page.getByLabel("Nueva tarea", { exact: true }).fill("llamar a la imprenta mañana a las 10 #akerra !!");
await page.waitForTimeout(300);
await shot("t1-preview");
await page.keyboard.press("Enter"); await page.waitForTimeout(1000);
await add("revisar stock hoy");
await add("pagar autónomos cada mes el 20");
await add("gimnasio cada martes y jueves");
await add("pedir tela a las 18:30");
console.log("hoy:", (await text()).slice(0, 260));
await shot("t2-hoy");

// ---- Completar tarea simple y recurrente
await page.getByRole("checkbox", { name: /revisar stock/i }).click(); await page.waitForTimeout(1200);
await shot("t3-hecha-undo");
console.log("tras completar:", (await text()).includes("Revisar stock") ? "sigue (mal)" : "desaparece (bien)");
await page.goto(base + "/tareas?v=todas");
await shot("t4-todas");
console.log("todas:", (await text()).slice(0, 300));
await page.goto(base + "/tareas?v=7dias");
await shot("t5-7dias");

// ---- Detalle + posponer
await page.goto(base + "/tareas?v=todas");
await page.getByRole("button", { name: /Pedir tela/i }).first().click();
await page.waitForTimeout(500);
await shot("t6-detalle");
await page.getByRole("button", { name: "Mañana", exact: true }).click(); await page.waitForTimeout(1200);
await page.goto(base + "/tareas?v=todas");
console.log("pedir tela tras posponer:", (await text()).match(/Pedir tela[^·]*·?[^A-Z]{0,40}/)?.[0]);

// ---- Calendario
await page.goto(base + "/calendario");
await page.getByRole("button", { name: "Evento", exact: true }).first().click(); await page.waitForTimeout(400);
await page.locator("#ev-title").fill("Reunión con imprenta");
await page.locator("#ev-st").fill("11:00"); await page.locator("#ev-et").fill("12:00");
await shot("c1-evento-form");
await page.getByRole("button", { name: "Guardar" }).click(); await page.waitForTimeout(1500);
await shot("c2-mes");
await page.goto(base + "/calendario?v=semana"); await page.waitForTimeout(800);
await shot("c3-semana");
await page.goto(base + "/calendario?v=agenda"); await page.waitForTimeout(800);
await shot("c4-agenda");
console.log("agenda:", (await text()).slice(0, 300));

// ---- Objetivos
await page.goto(base + "/objetivos");
await page.getByRole("button", { name: "Nuevo objetivo" }).click(); await page.waitForTimeout(300);
await page.locator("#g-title").fill("Ingresar 500 € este mes");
await page.locator("#g-m").selectOption("euros");
await page.locator("#g-t").fill("500");
await page.locator("#g-a").selectOption("income");
await shot("g1-form");
await page.getByRole("button", { name: "Guardar" }).click();
await page.waitForURL(/\/objetivos\/[0-9a-f-]{36}/, { timeout: 10000 }); await page.waitForTimeout(1000);
await shot("g2-detalle");
console.log("objetivo auto:", (await text()).slice(0, 220));
await page.goto(base + "/objetivos");
await page.getByRole("button", { name: "Nuevo objetivo" }).click(); await page.waitForTimeout(300);
await page.locator("#g-title").fill("Lanzar nueva colección");
await page.locator("#g-m").selectOption("milestones");
await page.getByRole("button", { name: "Guardar" }).click();
await page.waitForURL(/\/objetivos\/[0-9a-f-]{36}/, { timeout: 10000 }); await page.waitForTimeout(800);
for (const m of ["Diseños listos", "Producción", "Lanzamiento"]) { await page.getByLabel("Nuevo hito").fill(m); await page.keyboard.press("Enter"); await page.waitForTimeout(700); }
await page.getByRole("checkbox").first().click(); await page.waitForTimeout(1000);
console.log("hitos:", (await text()).slice(0, 200));
await page.goto(base + "/objetivos"); await page.waitForTimeout(600);
await shot("g3-lista");
console.log("ERRORES:", JSON.stringify(errors));
await browser.close();

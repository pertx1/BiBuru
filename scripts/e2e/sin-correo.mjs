// Barra lateral sin Correo, Objetivos ni Revisión (siguen en «Más»); el correo no aparece en ningún sitio.
// Uso: USER_ID=<uuid> node scripts/e2e/sin-correo.mjs  (con scripts/e2e/up.sh levantado)
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const base = "http://localhost:3100";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };
const errors = [];
// Escritorio: barra lateral.
const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-ES" });
await desk.addCookies([sessionCookie(process.env.USER_ID)]);
const page = await desk.newPage();
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base + "/", { waitUntil: "networkidle" });
const side = (await page.locator("aside nav a, nav[aria-label] a").allTextContents()).map((t) => t.trim());
ok(!side.includes("Correo") && !side.includes("Objetivos") && !side.includes("Revisión"), `barra lateral sin Correo/Objetivos/Revisión: ${side.join(", ")}`);
ok(side.includes("Tareas") && side.includes("Negocios"), "el resto sigue");
for (const path of ["/objetivos", "/revision"]) { await page.goto(base + path, { waitUntil: "networkidle" }); ok(new URL(page.url()).pathname === path && !(await page.getByText("Algo ha fallado").count()), `${path} sigue abriendo`); }
await page.goto(base + "/correo?abrir=x", { waitUntil: "networkidle" });
ok(new URL(page.url()).pathname === "/", "los enlaces antiguos de /correo llevan a Inicio");
await page.goto(base + "/ajustes", { waitUntil: "networkidle" });
ok(!(await page.getByRole("heading", { name: /Correo de Outlook/ }).count()), "Ajustes sin Correo de Outlook");
await page.goto(base + "/", { waitUntil: "networkidle" });
const editBtn = page.getByRole("button", { name: /Editar/ }).first();
if (await editBtn.count()) {
  await editBtn.click();
  const add = page.getByRole("button", { name: /Añadir widget/ }).first();
  if (await add.count()) { await add.click(); await page.waitForTimeout(500); ok(!(await page.getByText("Correos sin leer").count()) && !(await page.getByText("Mensajes sin responder").count()), "sin widgets de correo en la galería"); }
}
// Móvil: «Más» conserva Objetivos y Revisión, sin Correo.
const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES" });
await mob.addCookies([sessionCookie(process.env.USER_ID)]);
const m = await mob.newPage();
m.on("pageerror", (e) => errors.push(e.message));
await m.goto(base + "/mas", { waitUntil: "networkidle" });
const more = await m.locator("main").innerText();
ok(/Objetivos/.test(more) && /Revisión/.test(more) && !/Correo \(Outlook\)|\bCorreo\b(?! electr)/.test(more.replace(/correo/gi, (x) => x)), "«Más» tiene Objetivos y Revisión y no Correo");
ok(errors.length === 0, `sin errores de JavaScript ${errors.join(" | ")}`);
await browser.close();

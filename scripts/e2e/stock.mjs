// Stock: artículo con mínimo → pedido pendiente que lo reserva → tarea «Reponer» en Tareas → completarla pidiendo unidades.
// Uso: USER_ID=<uuid> BIZ=<uuid> node scripts/e2e/stock.mjs  (con scripts/e2e/up.sh levantado)
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const base = "http://localhost:3100";
const biz = process.env.BIZ;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES" });
await ctx.addCookies([sessionCookie(process.env.USER_ID)]);
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };
const name = `Sudadera E2E ${Date.now() % 10000}`;

await page.goto(`${base}/negocios/${biz}/stock`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Añadir artículo" }).click();
await page.locator("#si-name").fill(name);
await page.locator("#si-q").fill("1");
await page.locator("#si-min").fill("2");
await page.getByRole("button", { name: "Guardar", exact: true }).click();
await page.waitForTimeout(1500);
ok(await page.getByText(`${name}`).first().isVisible(), "artículo creado");
ok(await page.getByText("faltan 1").first().isVisible(), "bajo el mínimo → faltan 1");

// Un pedido «Sin hacer» de 3 unidades lo reserva: faltan 2 − (1 − 3) = 4.
await page.goto(`${base}/negocios/${biz}/pedidos`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Nuevo pedido" }).last().click();
await page.getByLabel("Producto de la línea 1").fill(name);
await page.locator('input[inputmode="numeric"]').first().fill("3");
await page.locator('input[inputmode="decimal"]').first().fill("30");
await page.getByRole("button", { name: "Guardar pedido" }).click();
await page.waitForURL(/nuevo=/);

await page.goto(`${base}/tareas?v=todas`, { waitUntil: "networkidle" });
const task = page.getByText(`Reponer: ${name}, faltan 4`);
ok(await task.isVisible(), "tarea «Reponer … faltan 4» en Tareas");
ok(await page.locator("li", { has: task }).getByText("Stock", { exact: true }).isVisible(), "con la etiqueta Stock");

// Completar: pregunta unidades; entran 4 → ya no falta → no se abre otra.
await page.locator("li", { has: task }).locator('input[type="checkbox"]').click();
ok(await page.getByText("¿Cuántas unidades han entrado?").isVisible(), "pregunta cuántas unidades han entrado");
await page.getByLabel("Unidades que han entrado").fill("4");
await page.getByRole("button", { name: "Registrar entrada y completar" }).click();
await page.waitForTimeout(2000);
await page.goto(`${base}/tareas?v=todas`, { waitUntil: "networkidle" });
ok(!(await page.getByText(`Reponer: ${name}`).count()), "la tarea se cierra y no vuelve");

await page.goto(`${base}/negocios/${biz}/stock`, { waitUntil: "networkidle" });
ok(await page.getByText("Reposición (tarea completada)").first().isVisible(), "la entrada queda en movimientos");
ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "sin scroll horizontal en móvil");
await browser.close();

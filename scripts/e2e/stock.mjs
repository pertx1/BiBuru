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

// Como en BATU: tarea «Pedir …» para HOY (sale en «Hoy») con la cantidad en la nota.
await page.goto(`${base}/tareas`, { waitUntil: "networkidle" });
const task = page.getByText(`Pedir ${name}`, { exact: true });
ok(await task.isVisible(), "tarea «Pedir …» en Tareas → Hoy");
ok(await page.locator("li", { has: task }).getByText("Stock", { exact: true }).isVisible(), "con la etiqueta Stock");

// Se tacha como cualquier tarea; mientras siga faltando, no vuelve a salir.
await page.locator("li", { has: task }).locator('input[type="checkbox"]').click();
await page.getByText("Hecha ✔").last().waitFor();
ok(true, "se tacha como cualquier tarea");
await page.goto(`${base}/tareas`, { waitUntil: "networkidle" });
ok(!(await page.getByText(`Pedir ${name}`, { exact: true }).count()), "tachada y aún faltando: no vuelve a salir");

// Apuntar la entrada desde Stock: ya hay stock → la clave se suelta.
await page.goto(`${base}/negocios/${biz}/stock`, { waitUntil: "networkidle" });
await page.getByRole("button", { name }).first().click();
await page.locator("#adj-n").fill("4");
await page.getByRole("button", { name: "Entrada" }).click();
await page.waitForTimeout(1500);
ok(await page.getByText("No falta nada").isVisible(), "con la entrada ya no falta nada");
await page.goto(`${base}/negocios/${biz}/stock`, { waitUntil: "networkidle" });
ok(await page.getByText("+4").first().isVisible(), "la entrada queda en movimientos");
ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "sin scroll horizontal en móvil");
await browser.close();

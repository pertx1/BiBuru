// Pedidos: «Nuevo pedido» (borrador, guardar y destacar), «Marcar como pagado», «Añadir cobro» y vista «Quién me debe».
// Uso: USER_ID=<uuid> BIZ=<uuid> node scripts/e2e/orders.mjs  (con scripts/e2e/up.sh levantado)
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const base = "http://localhost:3100";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES" });
await ctx.addCookies([sessionCookie(process.env.USER_ID)]);
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };
const url = `${base}/negocios/${process.env.BIZ}/pedidos`;

await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.goto(url, { waitUntil: "networkidle" });

// Borrador: escribir, cerrar y volver a abrir.
await page.getByRole("button", { name: "Nuevo pedido" }).last().click();
await page.locator("#o-customer").fill("Cliente E2E");
await page.getByRole("button", { name: "Cerrar" }).first().click();
await page.getByRole("button", { name: "Nuevo pedido" }).last().click();
ok(await page.getByText("Borrador recuperado").isVisible(), "el borrador se recupera");
ok((await page.locator("#o-customer").inputValue()) === "Cliente E2E", "con el cliente escrito");

// Guardar y ver el pedido destacado.
await page.getByLabel("Producto de la línea 1").fill("Sudadera");
await page.locator('input[inputmode="decimal"]').first().fill("25");
await page.getByRole("button", { name: "Guardar pedido" }).click();
await page.waitForURL(/nuevo=/);
await page.waitForLoadState("networkidle");
const id = new URL(page.url()).searchParams.get("nuevo");
const row = page.locator(`#pedido-${id}`);
ok(await row.isVisible(), "el pedido nuevo aparece en la lista");
ok((await row.getAttribute("class")).includes("ring-accent"), "y está destacado");
ok(await row.getByText("Pendiente", { exact: true }).isVisible(), "nace pendiente de cobro");

// Añadir cobro parcial y luego marcar como pagado.
await row.getByRole("button", { name: "Añadir cobro" }).click();
await page.getByLabel("Importe (€)").fill("10");
await page.getByRole("button", { name: "Guardar cobro" }).click();
await page.waitForTimeout(1500);
ok(await row.getByText("Pago parcial").isVisible(), "cobro parcial → «Pago parcial»");
ok(await row.getByText("Falta cobrar 15,00 €").isVisible(), "pendiente calculado (15 €)");
await row.getByRole("button", { name: "Marcar como pagado" }).click();
await page.waitForTimeout(1500);
ok(await row.getByText("Pagado", { exact: true }).isVisible(), "«Marcar como pagado» → Pagado");

// Quién me debe.
await page.goto(`${url}?vista=deudas`, { waitUntil: "networkidle" });
ok(await page.getByText("Quién me debe", { exact: true }).isVisible(), "vista «Quién me debe»");
const reclaim = page.getByRole("button", { name: "Crear tarea para reclamar" }).first();
if (await reclaim.count()) { await reclaim.click(); await page.waitForTimeout(1500); ok(await page.getByText("Tarea creada · ver").first().isVisible(), "tarea para reclamar creada"); }

// Sin desplazamiento horizontal.
ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "sin scroll horizontal en móvil");
await browser.close();

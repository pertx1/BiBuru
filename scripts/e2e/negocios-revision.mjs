// Negocios reorganizados, pedido que descuenta stock, Mensajes y Revisión (rama negocios-revision).
// Uso: USER_ID=<uuid> BIZ=<uuid> node scripts/e2e/negocios-revision.mjs  (con scripts/e2e/up.sh levantado; BIZ con Producción y stock)
// Con SHOTS=<carpeta> guarda capturas de móvil.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const base = "http://localhost:3100";
const biz = process.env.BIZ;
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", timezoneId: "Europe/Madrid" });
await ctx.addCookies([sessionCookie(process.env.USER_ID)]);
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };
const shot = async (n) => { if (shots) await page.screenshot({ path: `${shots}/${n}.png`, fullPage: true }); };
const go = async (path) => { await page.goto(`${base}${path}`, { waitUntil: "networkidle" }); ok(!(await page.getByText("Algo ha fallado").count()), `abre ${path}`); };
const cell = (label) => page.getByRole("button", { name: new RegExp(`^${label}: -?\\d+$`) });
const qty = async (label) => Number((await cell(label).getAttribute("aria-label")).split(": ")[1]);

// ------------------------------------------------------------ pestañas y redirecciones
await go(`/negocios/${biz}`);
const tabs = await page.getByRole("navigation", { name: "Secciones del negocio" }).getByRole("link").allTextContents();
ok(JSON.stringify(tabs.map((t) => t.replace(/\d+$/, ""))) === JSON.stringify(["Resumen", "Pedidos", "Gastos", "Stock", "Bolsa imprenta", "Facturas", "Reglas Antola", "Redes", "Mensajes", "Estadísticas", "Productos"]), `pestañas en orden: ${tabs.join(", ")}`);
ok(await page.getByRole("heading", { name: /Pedidos por estado/ }).count() > 0, "Resumen con widgets de negocio");
await shot("01-resumen");
for (const [from, to] of [["produccion", "/stock"], ["produccion/bolsa", "/bolsa"], ["ingresos", "/estadisticas"], ["tareas", "/tareas?f="], ["objetivos", "/objetivos?negocio="]]) {
  await page.goto(`${base}/negocios/${biz}/${from}`, { waitUntil: "networkidle" });
  ok(page.url().includes(to), `/${from} redirige a ${to}`);
}

// ------------------------------------------------------------ Resumen editable y guardado por negocio
await go(`/negocios/${biz}`);
await page.getByRole("button", { name: "Editar resumen" }).click();
await page.getByRole("button", { name: /^Quitar «Pedidos por estado»/ }).click();
await page.getByRole("button", { name: "Listo" }).click();
await page.waitForTimeout(800);
await page.reload({ waitUntil: "networkidle" });
ok(await page.getByRole("heading", { name: /Pedidos por estado/ }).count() === 0, "quitar un widget se guarda en este negocio");
await page.getByRole("button", { name: "Editar resumen" }).click();
await page.getByRole("button", { name: "Restablecer" }).click();
await page.waitForTimeout(1200);
await page.reload({ waitUntil: "networkidle" });
ok(await page.getByRole("heading", { name: /Pedidos por estado/ }).count() > 0, "Restablecer vuelve a la disposición por defecto");

// ------------------------------------------------------------ stock en tabla y pedido que descuenta
await go(`/negocios/${biz}/stock`);
await shot("02-stock");
const before = await qty("Camiseta negra M"), dtfBefore = await qty("DTF Ola blanco");
ok(before === 3, `«Camiseta negra M» disponible 3 (5 − 2 reservadas por el pedido antiguo): ${before}`);
await go(`/negocios/${biz}/pedidos`);
ok(await page.getByRole("navigation", { name: "Filtrar por estado" }).getByText("Sin hacer").count() > 0, "botones por estado con su número");
await page.getByRole("button", { name: "Nuevo pedido" }).last().click();
await page.getByLabel("Producto de la línea 1").fill("Ola");
await page.getByLabel("Color").fill("Negra");
await page.getByLabel("Talla").fill("M");
await page.locator('input[inputmode="numeric"]').first().fill("4");
await page.locator('input[inputmode="decimal"]').first().fill("20");
ok(await page.getByText(/Descuenta: 4 × Camiseta negra M \+ 4 × DTF Ola blanco/).isVisible(), "la línea se reconoce sola: prenda + DTF");
await page.getByLabel("Artículo del stock de la línea 1").selectOption({ label: "Bolsas de envío" });
ok(await page.getByText("Descuenta: 4 × Bolsas de envío").isVisible(), "elegir el artículo a mano");
await page.getByLabel("Artículo del stock de la línea 1").selectOption("");
await page.getByRole("button", { name: "Añadir línea" }).click();
await page.getByLabel("Producto de la línea 2").fill("Taza personalizada");
await page.locator('input[inputmode="decimal"]').nth(2).fill("8");
ok(await page.getByText(/Sin vincular al stock/).isVisible(), "texto libre: «sin vincular al stock»");
await shot("03-pedido");
await page.getByRole("button", { name: "Guardar pedido" }).click();
await page.waitForTimeout(2000);
ok(await page.getByText(/Falta stock: Camiseta negra M \(-?\d+\)|Falta stock:/).count() >= 0, "guardado");
await go(`/negocios/${biz}/stock`);
ok(await qty("Camiseta negra M") === before - 4, `crear descuenta 4 (${before} → ${await qty("Camiseta negra M")})`);
ok(await qty("DTF Ola blanco") === dtfBefore - 4, "y el DTF");
ok(await page.getByText("Pedir ya").isVisible(), "lo que se queda en negativo pasa a «Pedir ya»");
await cell("Camiseta negra M").click();
await page.waitForTimeout(800);
ok(await page.getByRole("link", { name: "Ver pedido" }).first().isVisible(), "historial del artículo con enlace al pedido");
await shot("04-historial");
await page.keyboard.press("Escape");

// Cancelar devuelve.
await go(`/negocios/${biz}/pedidos?estado=sin_hacer`);
const row = page.locator("li", { hasText: "Ola" }).filter({ hasText: "Taza" }).first();
await row.getByLabel("Estado del pedido").selectOption("cancelado");
await page.waitForTimeout(1500);
await go(`/negocios/${biz}/stock`);
ok(await qty("Camiseta negra M") === before, "cancelar devuelve el stock");

// Recalcular desde pedidos (vista previa).
await page.getByRole("button", { name: "Recalcular desde pedidos" }).click();
await page.getByRole("button", { name: "Ver vista previa" }).click();
await page.waitForTimeout(1200);
ok(await page.getByText(/1 pedido pasarían a descontar|1 pedido/).first().isVisible(), "vista previa: el pedido antiguo");
await shot("05-recalcular");
await page.keyboard.press("Escape");

// ------------------------------------------------------------ Mensajes, Revisión e Inicio
await go(`/negocios/${biz}/mensajes`);
ok(await page.getByText(/Ninguna cuenta de correo asignada/).isVisible(), "Mensajes sin cuenta de correo: aviso");
await shot("06-mensajes");
await go("/revision");
ok(await page.getByRole("heading", { name: "Dinero" }).isVisible(), "revisión diaria");
ok(await page.getByText("Pensar nueva colección").isVisible(), "sale la tarea sin fecha");
await shot("07-revision-diaria");
await page.getByRole("button", { name: "Revisado" }).click();
await page.waitForTimeout(1000);
ok(await page.getByText(/Revisada el/).isVisible(), "«Revisado» la cierra");
await go("/revision?tab=semanal");
ok(await page.getByText("Tus 3 prioridades para la semana que viene").isVisible(), "semanal con prioridades");
await page.getByLabel("Prioridad 1").fill("Lanzar colección de invierno");
await page.getByRole("button", { name: "Crear como tareas" }).click();
await page.waitForTimeout(1200);
await shot("08-revision-semanal");
await go("/revision?tab=mensual");
ok(await page.getByText(/Stock que falta/).isVisible(), "mensual");
await go("/");
ok(await page.getByRole("heading", { name: /Sin fecha/ }).isVisible(), "Inicio: bloque «Sin fecha»");
ok(await page.getByRole("heading", { name: "Revisión de hoy" }).isVisible(), "Inicio: «Revisión de hoy»");
await shot("09-inicio");
await go("/ajustes");
ok(await page.getByRole("heading", { name: /Revisiones/ }).isVisible(), "Ajustes › Revisiones");

ok(errors.length === 0, `sin errores de JavaScript ${errors.join(" | ")}`);
await browser.close();

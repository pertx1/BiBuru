import { chromium } from "playwright-core";
import crypto from "node:crypto";
const SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const claims = { sub: process.env.USER_ID, role: "authenticated", aud: "authenticated", email: "yo@example.com", exp: now + 3600, iat: now };
const h = b64({ alg: "HS256", typ: "JWT" }), p = b64(claims);
const jwt = h + "." + p + "." + crypto.createHmac("sha256", SECRET).update(h + "." + p).digest("base64url");
const session = { access_token: jwt, refresh_token: "r", expires_at: now + 3600, expires_in: 3600, token_type: "bearer", user: { id: claims.sub, email: claims.email, aud: "authenticated", role: "authenticated" } };
const cookie = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addCookies([{ name: "sb-localhost-auth-token", value: cookie, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
const shot = (n) => page.screenshot({ path: "/tmp/e2e/" + n + ".png", fullPage: false });

await page.goto("http://localhost:3100/");
console.log("home:", await page.locator("h1").first().textContent());
await page.goto("http://localhost:3100/negocios");
console.log("negocios h1:", await page.locator("h1").first().textContent());
await shot("1-negocios-vacio");

// Crear negocio
await page.getByRole("button", { name: "Nuevo negocio" }).click();
await page.getByLabel("Nombre").fill("Akerra");
await page.getByLabel("Descripción breve").fill("Marca de ropa");
await page.getByRole("button", { name: "Guardar" }).click();
await page.waitForURL(/\/negocios\/[0-9a-f-]{36}$/, { timeout: 10000 });
const base = page.url();
console.log("negocio creado:", base);
await shot("2-resumen");

// Pedido
await page.goto(base + "/pedidos");
await page.getByRole("button", { name: "Nuevo pedido" }).click();
await page.getByLabel("Cliente").fill("Ana");
await page.getByPlaceholder("Producto").fill("Camiseta");
await page.getByPlaceholder("Color").fill("Negra");
await page.getByPlaceholder("Talla").fill("M");
await page.getByLabel("Cantidad").fill("2");
await page.getByLabel("Precio ud. (€)").fill("25,50");
await shot("3-pedido-form");
await page.getByRole("button", { name: "Guardar pedido" }).click();
await page.waitForTimeout(1500);
console.log("pedidos lista:", (await page.locator("ul li").first().textContent())?.replace(/\s+/g, " "));
await shot("4-pedidos");

// Gasto con categoría y recurrencia
await page.goto(base + "/gastos");
await page.getByRole("button", { name: "Nuevo gasto" }).click();
await page.locator("#e-amount").fill("12,50");
await page.locator("#e-concept").fill("Cinta de embalar");
await page.locator("#e-cat").selectOption({ label: "Envíos" });
await page.getByRole("button", { name: "Guardar gasto" }).click();
await page.waitForTimeout(1500);
console.log("gastos lista:", (await page.locator("ul li").first().textContent())?.replace(/\s+/g, " "));
await shot("5-gastos");

// Ingreso suelto
await page.goto(base + "/ingresos");
await page.getByRole("button", { name: "Nuevo ingreso" }).click();
await page.getByLabel("Importe (€)").fill("10");
await page.getByLabel("Fuente").fill("Vinted");
await page.getByRole("button", { name: "Guardar" }).click();
await page.waitForTimeout(1500);

// Resumen y estadísticas
await page.goto(base);
await page.waitForTimeout(1500);
console.log("resumen stats:", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 300));
await shot("6-resumen");
await page.goto(base + "/estadisticas");
await page.waitForTimeout(1500);
await shot("7-stats");
await page.goto("http://localhost:3100/negocios");
await page.waitForTimeout(1500);
await shot("8-negocios");
console.log("negocios:", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 250));
// CSV
const r = await ctx.request.get("http://localhost:3100/api/export/pedidos?negocio=" + base.split("/").pop());
console.log("csv:", r.status(), (await r.text()).split("\n").slice(0, 2).join(" | "));
console.log("ERRORES:", JSON.stringify(errors));
await browser.close();

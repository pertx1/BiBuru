// Pedidos: en cada línea hay que marcar camiseta, sudadera u otro, y según eso resta de una prenda u otra.
// Uso: USER_ID=<uuid> node scripts/e2e/orders-garment.mjs  (con scripts/e2e/up.sh levantado)
import pg from "pg";
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const base = "http://localhost:3100";
const db = new pg.Client({ connectionString: "postgres://postgres:postgres@localhost:5432/biburu_test" });
await db.connect();
const q = async (s, p) => (await db.query(s, p)).rows;
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };
const U = process.env.USER_ID;
const ws = (await q("select default_workspace_id id from profiles where user_id=$1", [U]))[0].id;
await q("delete from businesses where workspace_id=$1 and name='Prendas SL'", [ws]);
const biz = (await q("insert into businesses (workspace_id,user_id,name,production_enabled) values ($1,$2,'Prendas SL',true) returning id", [ws, U]))[0].id;
for (const m of ["Gris", "Negra", "Sudadera gris", "Sudadera negra"]) await q("insert into tshirt_stocks (workspace_id,user_id,business_id,model,size,quantity) values ($1,$2,$3,$4,'M',10)", [ws, U, biz, m]);
await q("insert into dtf_designs (workspace_id,user_id,business_id,name,kind) values ($1,$2,$3,'Flysch','standalone')", [ws, U, biz]);
await q("insert into dtf_stocks (workspace_id,user_id,business_id,name,variant,quantity) values ($1,$2,$3,'Flysch','UNICO',10)", [ws, U, biz]);
const qty = async (model) => (await q("select quantity from tshirt_stocks where business_id=$1 and model=$2 and size='M'", [biz, model]))[0].quantity;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES" });
await ctx.addCookies([sessionCookie(U)]);
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${base}/negocios/${biz}/pedidos`, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());

const newOrder = async (customer, lines) => {
  await page.getByRole("button", { name: "Nuevo pedido" }).last().click();
  await page.locator("#o-customer").fill(customer);
  for (const [i, l] of lines.entries()) {
    if (i > 0) await page.getByRole("button", { name: "Añadir línea" }).click();
    await page.getByLabel(`Producto de la línea ${i + 1}`).fill(l.product);
    await page.getByLabel("Color").nth(i).fill(l.color);
    await page.getByLabel("Talla").nth(i).fill("M");
    await page.locator('input[inputmode="decimal"]').nth(i * 2).fill("25");
    if (l.garment) await page.getByRole("radiogroup", { name: `Prenda de la línea ${i + 1}` }).getByRole("radio", { name: l.garment }).click();
  }
};

// 1) Sin marcar: no deja guardar.
await newOrder("Sin marcar", [{ product: "Flysch", color: "Gris" }]);
ok(await page.getByRole("radiogroup", { name: "Prenda de la línea 1" }).isVisible(), "cada línea pide camiseta / sudadera / otro");
await page.getByRole("button", { name: "Guardar pedido" }).click();
ok(await page.getByText("Marca en la línea 1 si es camiseta, sudadera u otro.").first().waitFor({ timeout: 8000 }).then(() => true, () => false), "sin marcar no se guarda");
// 2) Sudadera: resta la sudadera gris; el texto de abajo lo dice antes de guardar.
await page.getByRole("radiogroup", { name: "Prenda de la línea 1" }).getByRole("radio", { name: "Sudadera" }).click();
ok(await page.getByText(/Descuenta: 1 × Sudadera gris M \+ 1 × DTF Flysch/).isVisible(), "al marcar Sudadera, la línea dice que resta la sudadera gris");
await page.getByRole("radiogroup", { name: "Prenda de la línea 1" }).getByRole("radio", { name: "Camiseta" }).click();
ok(await page.getByText(/Descuenta: 1 × Camiseta gris M \+ 1 × DTF Flysch/).isVisible(), "al marcar Camiseta, la camiseta gris");
await page.getByRole("radiogroup", { name: "Prenda de la línea 1" }).getByRole("radio", { name: "Sudadera" }).click();
await page.screenshot({ path: process.env.SHOT ?? "/tmp/orders-garment.png" });
await page.getByRole("button", { name: "Guardar pedido" }).click();
await page.waitForURL(/nuevo=/);
const items = await q("select garment, stock_effects from order_items i join orders o on o.id=i.order_id where o.business_id=$1 and o.customer='Sin marcar'", [biz]);
ok(items[0].garment === "sudadera" && JSON.stringify(items[0].stock_effects).includes("tshirt|Sudadera gris|M"), "guardado: sudadera, resta Sudadera gris M");
ok(await qty("Sudadera gris") === 9 && await qty("Gris") === 10, `stock: sudadera gris 10 → ${await qty("Sudadera gris")}, camiseta gris sin tocar`);

// 3) Dos líneas: camiseta y «otro».
await newOrder("Mixto", [{ product: "Flysch", color: "Negra", garment: "Camiseta" }, { product: "Flysch", color: "Negra", garment: "Otro" }]);
await page.getByRole("button", { name: "Guardar pedido" }).click();
await page.waitForTimeout(2000);
ok(await qty("Negra") === 9 && await qty("Sudadera negra") === 10, "camiseta resta la camiseta negra; «Otro» no resta prenda");
ok(await page.getByText(/Flysch Negra M \(camiseta\)/).first().isVisible(), "la lista dice camiseta o sudadera en cada línea");
ok(errors.length === 0, `sin errores de JavaScript ${errors.join(" | ")}`);
await q("delete from businesses where id=$1", [biz]);
await browser.close(); await db.end();

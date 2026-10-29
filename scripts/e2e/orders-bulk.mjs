// Pedidos: selección masiva → cambiar estado (con «Deshacer») y marcar pagados.
// Uso: USER_ID=<uuid> node scripts/e2e/orders-bulk.mjs  (con scripts/e2e/up.sh levantado)
import pg from "pg";
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const base = "http://localhost:3100";
const db = new pg.Client({ connectionString: "postgres://postgres:postgres@localhost:5432/biburu_test" });
await db.connect();
const q = (s, p) => db.query(s, p);
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };
const U = process.env.USER_ID;
const ws = (await q("select default_workspace_id id from profiles where user_id=$1", [U])).rows[0].id;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const biz = (await q("insert into businesses (workspace_id,user_id,name) values ($1,$2,'Masivo SL') returning id", [ws, U])).rows[0].id;
for (const [c, st] of [["Ana", "sin_llegar"], ["Bea", "sin_llegar"], ["Carla", "sin_llegar"], ["Dani", "en_casa"]]) {
  const o = (await q("insert into orders (workspace_id,user_id,business_id,order_date,status,customer,payment_reviewed) values ($1,$2,$3,$4,$5,$6,true) returning id", [ws, U, biz, today, st, c])).rows[0].id;
  await q("insert into order_items (workspace_id,user_id,order_id,product_name,quantity,unit_price_cents) values ($1,$2,$3,'Camiseta',1,1500)", [ws, U, o]);
}
const statuses = async () => Object.fromEntries((await q("select customer, status from orders where business_id=$1", [biz])).rows.map((r) => [r.customer, r.status]));

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES" });
await ctx.addCookies([sessionCookie(U)]);
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
await page.goto(`${base}/negocios/${biz}/pedidos?estado=sin_llegar`, { waitUntil: "networkidle" });

await page.getByRole("button", { name: "Seleccionar", exact: true }).click();
await page.getByRole("button", { name: "Seleccionar todos (3)" }).click();
ok(await page.getByText("3 pedidos seleccionados").isVisible(), "selecciona todos los de la lista filtrada");
await page.screenshot({ path: process.env.SHOT ?? "/tmp/orders-bulk.png" });
await page.getByLabel("Cambiar estado de los seleccionados").selectOption("enviado");
await page.getByText("3 pedidos → Enviado").waitFor();
let s = await statuses();
ok(s.Ana === "enviado" && s.Bea === "enviado" && s.Carla === "enviado" && s.Dani === "en_casa", "cambia solo los seleccionados");
await page.getByRole("button", { name: "Deshacer" }).click();
await page.waitForTimeout(1500);
s = await statuses();
ok(s.Ana === "sin_llegar" && s.Carla === "sin_llegar", "Deshacer devuelve el estado anterior");

// Elegir a mano dos y marcarlos pagados.
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: "Seleccionar", exact: true }).click();
await page.getByLabel("Seleccionar Ana").check();
await page.getByLabel("Seleccionar Bea").check();
ok(await page.getByText("2 pedidos seleccionados").isVisible(), "selección a mano");
await page.getByRole("button", { name: "Marcar pagados" }).click();
await page.getByText("2 pedidos marcados como pagados").waitFor();
const paid = (await q("select customer, due_cents from orders where business_id=$1 order by customer", [biz])).rows;
ok(Number(paid[0].due_cents) === 0 && Number(paid[1].due_cents) === 0 && Number(paid[2].due_cents) === 1500, "pagados solo esos dos");
ok(errors.length === 0, `sin errores de JavaScript ${errors.join(" | ")}`);
await q("delete from businesses where id=$1", [biz]);
await browser.close(); await db.end();

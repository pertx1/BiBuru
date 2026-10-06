/**
 * Importa los datos de PROFITY (Postgres/Neon) a BiBuru (Supabase).
 *
 *   npm run import:profity -- --email tu@correo.com --dry-run      (solo simula)
 *   npm run import:profity -- --email tu@correo.com                (importa)
 *
 * Variables (en .env.local o en el entorno):
 *   PROFITY_DATABASE_URL        cadena de conexión de la base de PROFITY (Neon)
 *   NEXT_PUBLIC_SUPABASE_URL    URL de tu proyecto de Supabase
 *   SUPABASE_SERVICE_ROLE_KEY   clave secreta (service_role). Solo en tu ordenador, nunca en Vercel.
 *
 * Opciones: --business "Akerra"  --vinted-business "Vinted"  --no-vinted  --profity-email correo
 *           --dry-run  --yes (no pregunta)
 * Se puede repetir sin duplicar: cada fila lleva un external_id único.
 */
import { createInterface } from "node:readline/promises";
import { config } from "dotenv";
import { Client } from "pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { buildPlan, expectedTotals, type Plan, type Source } from "../src/lib/profity-import";
import { applyProfityPlan } from "../src/lib/profity-apply";

config({ path: ".env.local" });
config();

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const eur = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const need = (name: string) => {
  const v = process.env[name];
  if (!v) { console.error(`Falta la variable ${name}. Mira .env.example.`); process.exit(1); }
  return v;
};

async function readSource(): Promise<Source> {
  const url = need("PROFITY_DATABASE_URL");
  const pg = new Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
  await pg.connect();
  try {
    const users = (await pg.query('select id, email from "User" order by "createdAt"')).rows as { id: string; email: string }[];
    if (users.length === 0) throw new Error("PROFITY no tiene usuarios.");
    const wanted = opt("profity-email");
    const user = wanted ? users.find((u) => u.email.toLowerCase() === wanted.toLowerCase()) : users.length === 1 ? users[0] : undefined;
    if (!user) throw new Error(`Hay varios usuarios en PROFITY (${users.map((u) => u.email).join(", ")}). Indica --profity-email.`);
    console.log(`Origen: usuario de PROFITY ${user.email}`);
    // Las fechas de Prisma son "timestamp sin zona" en UTC: se leen como texto ISO con Z.
    const ts = (c: string) => `to_char("${c}", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
    const q = (sql: string) => pg.query(sql, [user.id]).then((r) => r.rows);
    const expenses = await q(`select id, ${ts("date")} as date, category, concept, amount, "paymentMethod" from "Expense" where "userId"=$1 order by date, id`);
    const incomes = await q(`select id, ${ts("date")} as date, source, concept, amount, method from "Income" where "userId"=$1 order by date, id`);
    const orders = await q(`select id, "orderNumber"::text as "orderNumber", ${ts("date")} as date, quantity, model, color, size, price, status::text as status from "Order" where "userId"=$1 order by date, id`);
    const tshirtStocks = await q(`select model::text as model, size, quantity from "TshirtStock" where "userId"=$1`);
    const dtfStocks = await q(`select name, variant::text as variant, quantity from "DtfStock" where "userId"=$1`);
    const shirtRules = await q(`select "shirtColor", "dtfColor" from "ShirtDtfRule" where "userId"=$1`);
    const designRules = await q(`select design, "dtfColor" from "DesignDtfRule" where "userId"=$1`);
    const invoices = await q(`select id, name, url from "Invoice" where "userId"=$1 order by "createdAt"`);
    return { expenses, incomes, orders, tshirtStocks, dtfStocks, shirtRules, designRules, invoices } as Source;
  } finally {
    await pg.end();
  }
}

function printPlan(plan: Plan) {
  const t = expectedTotals(plan);
  console.log("\nSe va a importar:");
  console.table({
    Pedidos: { registros: t.orders.count, "suma (€)": eur(t.orders.totalCents), nota: `${t.ordersActive.count} sin cancelar = ${eur(t.ordersActive.totalCents)}` },
    Gastos: { registros: t.expenses.count, "suma (€)": eur(t.expenses.totalCents), nota: `${plan.categories.length} categorías` },
    Ingresos: { registros: t.incomes.count, "suma (€)": eur(t.incomes.totalCents), nota: "" },
  });
  console.log(`Productos para el catálogo: ${plan.products.length}`);
  const pr = plan.production;
  console.log(`Producción: ${pr.tshirtStocks.length} filas de stock de prendas, ${pr.designs.length} diseños DTF, ${pr.dtfStocks.length} filas de stock DTF, ${pr.shirtRules.length + pr.designRules.length} reglas, ${pr.invoices.length} facturas`);
  for (const w of plan.warnings) console.log(`  ⚠ ${w}`);
}


async function main() {
  const dryRun = flag("dry-run");
  const separateVinted = !flag("no-vinted");
  const source = await readSource();
  const plan = buildPlan(source, { separateVinted });
  printPlan(plan);
  const vintedCount = plan.expenses.filter((e) => e.biz === "vinted").length + plan.incomes.filter((i) => i.biz === "vinted").length;
  if (dryRun) {
    console.log(`\nSimulación: nada se ha escrito.${vintedCount ? ` ${vintedCount} apuntes de Vinted irían a un negocio aparte.` : ""}`);
    return;
  }

  const email = opt("email") ?? (() => { console.error("Falta --email (tu correo de BiBuru)."); process.exit(1); })();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q: string, def: string) => (flag("yes") ? def : (await rl.question(`${q} [${def}]: `)).trim() || def);
  const mainName = opt("business") ?? (await ask("¿A qué negocio asigno pedidos y gastos?", "Akerra"));
  const vintedName = vintedCount ? (opt("vinted-business") ?? (await ask("¿Y los apuntes de Vinted?", "Vinted")) ) : "";
  if (!flag("yes")) {
    const ok = (await rl.question(`\nImportar en la cuenta ${email}: «${mainName}»${vintedName ? ` y «${vintedName}»` : ""}. ¿Continuar? (s/N) `)).trim().toLowerCase();
    if (ok !== "s" && ok !== "si" && ok !== "sí") { console.log("Cancelado."); rl.close(); return; }
  }
  rl.close();

  const sb: SupabaseClient<Database> = createClient<Database>(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { data: users, error: uerr } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (uerr) throw uerr;
  // `--email auto`: si en BiBuru hay una sola cuenta, se usa esa (útil al importar desde el despliegue).
  const user = email === "auto"
    ? (users.users.length === 1 ? users.users[0] : undefined)
    : users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(email === "auto" ? `Hay ${users.users.length} cuentas en BiBuru: indica --email.` : `No existe el usuario ${email} en Supabase. Créalo primero (Authentication → Users).`);
  console.log(`Destino: cuenta de BiBuru ${user.email}`);
  const { data: profile, error: perr } = await sb.from("profiles").select("default_workspace_id").eq("user_id", user.id).single();
  if (perr || !profile.default_workspace_id) throw new Error("El usuario no tiene perfil/workspace.");
  const ws = profile.default_workspace_id;

  const result = await applyProfityPlan(sb, { workspaceId: ws, userId: user.id }, plan, { main: mainName, vinted: vintedName });
  const im = result.imported;
  console.log(`\nImportado: ${im.orders} pedidos, ${im.expenses} gastos, ${im.incomes} ingresos nuevos (ya existían ${im.ordersExisting}, ${im.expensesExisting}, ${im.incomesExisting}).`);
  const rows = result.rows;
  console.log("\nConciliación origen ↔ destino:");
  console.table(rows);
  if (rows.some((r) => r.resultado.startsWith("✘"))) { console.error("Hay diferencias. No sigas hasta revisarlas."); process.exit(1); }
  console.log("Todo coincide. Importación completada.");
}

main().catch((e) => { console.error("\nError:", e instanceof Error ? e.message : e); process.exit(1); });

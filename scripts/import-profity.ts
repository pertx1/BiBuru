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
import { buildPlan, expectedTotals, type BizKey, type Plan, type Source } from "../src/lib/profity-import";

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
    return { expenses, incomes, orders } as Source;
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
  for (const w of plan.warnings) console.log(`  ⚠ ${w}`);
}

const chunk = <T,>(xs: T[], n = 400) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

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
  const user = users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`No existe el usuario ${email} en Supabase. Créalo primero (Authentication → Users).`);
  const { data: profile, error: perr } = await sb.from("profiles").select("default_workspace_id").eq("user_id", user.id).single();
  if (perr || !profile.default_workspace_id) throw new Error("El usuario no tiene perfil/workspace.");
  const ws = profile.default_workspace_id;
  const base = { workspace_id: ws, user_id: user.id };

  async function ensureBusiness(name: string, color: string): Promise<string> {
    const { data } = await sb.from("businesses").select("id").eq("workspace_id", ws).ilike("name", name).maybeSingle();
    if (data) return data.id;
    const { data: created, error } = await sb.from("businesses").insert({ ...base, name, color }).select("id").single();
    if (error) throw error;
    return created.id;
  }
  const biz: Record<BizKey, string> = { main: await ensureBusiness(mainName, "#0f766e"), vinted: "" };
  biz.vinted = vintedName ? await ensureBusiness(vintedName, "#ea580c") : biz.main;

  // Categorías y productos (no se duplican)
  const { data: cats } = await sb.from("expense_categories").select("id, name").eq("workspace_id", ws);
  const catId = new Map((cats ?? []).map((c) => [c.name.toLowerCase(), c.id]));
  for (const name of plan.categories) {
    if (catId.has(name.toLowerCase())) continue;
    const { data, error } = await sb.from("expense_categories").insert({ ...base, name }).select("id").single();
    if (error) throw error;
    catId.set(name.toLowerCase(), data.id);
  }
  const { data: existingProducts } = await sb.from("products").select("name").eq("workspace_id", ws).eq("business_id", biz.main);
  const have = new Set((existingProducts ?? []).map((p) => p.name.toLowerCase()));
  const newProducts = plan.products.filter((p) => !have.has(p.name.toLowerCase()));
  for (const c of chunk(newProducts)) {
    const { error } = await sb.from("products").insert(c.map((p) => ({ ...base, business_id: biz.main, name: p.name, price_cents: p.price_cents })));
    if (error) throw error;
  }

  const existing = async (table: "orders" | "expenses" | "incomes") => {
    const ids = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select("external_id").eq("workspace_id", ws).like("external_id", "profity:%").range(from, from + 999);
      if (error) throw error;
      data.forEach((r) => r.external_id && ids.add(r.external_id));
      if (data.length < 1000) return ids;
    }
  };

  // Gastos e ingresos
  const haveE = await existing("expenses");
  const newE = plan.expenses.filter((e) => !haveE.has(e.external_id));
  for (const c of chunk(newE)) {
    const { error } = await sb.from("expenses").insert(c.map((e) => ({
      ...base, business_id: biz[e.biz], expense_date: e.expense_date, concept: e.concept, category_id: catId.get(e.category.toLowerCase()) ?? null,
      amount_cents: e.amount_cents, payment_method: e.payment_method, external_id: e.external_id,
    })));
    if (error) throw error;
  }
  const haveI = await existing("incomes");
  const newI = plan.incomes.filter((i) => !haveI.has(i.external_id));
  for (const c of chunk(newI)) {
    const { error } = await sb.from("incomes").insert(c.map((i) => ({
      ...base, business_id: biz[i.biz], income_date: i.income_date, source: i.source, concept: i.concept, amount_cents: i.amount_cents, method: i.method, external_id: i.external_id,
    })));
    if (error) throw error;
  }

  // Pedidos y sus líneas
  const haveO = await existing("orders");
  const newO = plan.orders.filter((o) => !haveO.has(o.external_id));
  const prodByName = new Map((await sb.from("products").select("id, name").eq("workspace_id", ws).eq("business_id", biz.main)).data?.map((p) => [p.name.toLowerCase(), p.id]) ?? []);
  for (const c of chunk(newO, 200)) {
    const { data: inserted, error } = await sb.from("orders").insert(c.map((o) => ({
      ...base, business_id: biz[o.biz], order_date: o.order_date, order_number: o.order_number, status: o.status, notes: o.notes, external_id: o.external_id,
    }))).select("id, external_id");
    if (error) throw error;
    const idOf = new Map(inserted.map((r) => [r.external_id, r.id]));
    const items = c.flatMap((o) => o.items.map((i) => ({
      ...base, order_id: idOf.get(o.external_id)!, product_id: prodByName.get(i.product_name.toLowerCase()) ?? null,
      product_name: i.product_name, color: i.color, size: i.size, quantity: i.quantity, unit_price_cents: i.unit_price_cents,
    })));
    const { error: ierr } = await sb.from("order_items").insert(items);
    if (ierr) throw ierr;
  }
  console.log(`\nImportado: ${newO.length} pedidos, ${newE.length} gastos, ${newI.length} ingresos nuevos (ya existían ${plan.orders.length - newO.length}, ${plan.expenses.length - newE.length}, ${plan.incomes.length - newI.length}).`);

  // Conciliación: origen (plan) vs destino (base de datos)
  const sumAll = async (table: "orders" | "expenses" | "incomes", col: string, activeOnly = false) => {
    let count = 0, total = 0;
    for (let from = 0; ; from += 1000) {
      const base = sb.from(table).select(activeOnly ? `${col}, status` : col).eq("workspace_id", ws).like("external_id", "profity:%");
      const { data, error } = await base.range(from, from + 999);
      if (error) throw error;
      let rows = data as unknown as Record<string, number | string>[];
      if (activeOnly) rows = rows.filter((r) => r.status !== "cancelado");
      count += rows.length;
      total += rows.reduce((s, r) => s + Number(r[col]), 0);
      if ((data as unknown[]).length < 1000) return { count, totalCents: total };
    }
  };
  const exp = expectedTotals(plan);
  const got = { orders: await sumAll("orders", "total_cents"), ordersActive: await sumAll("orders", "total_cents", true), expenses: await sumAll("expenses", "amount_cents"), incomes: await sumAll("incomes", "amount_cents") };
  const rows = (Object.keys(exp) as (keyof typeof exp)[]).map((k) => ({
    tabla: k, "origen nº": exp[k].count, "destino nº": got[k].count, "origen €": eur(exp[k].totalCents), "destino €": eur(got[k].totalCents),
    resultado: exp[k].count === got[k].count && exp[k].totalCents === got[k].totalCents ? "✔ coincide" : "✘ NO coincide",
  }));
  console.log("\nConciliación origen ↔ destino:");
  console.table(rows);
  if (rows.some((r) => r.resultado.startsWith("✘"))) { console.error("Hay diferencias. No sigas hasta revisarlas."); process.exit(1); }
  console.log("Todo coincide. Importación completada.");
}

main().catch((e) => { console.error("\nError:", e instanceof Error ? e.message : e); process.exit(1); });

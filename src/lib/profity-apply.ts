import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { expectedTotals, type BizKey, type Plan } from "./profity-import";

/**
 * Escribe en BiBuru un plan de importación de PROFITY y concilia origen ↔ destino. Funciona con cualquier cliente:
 * la clave de servicio (script) o la sesión del usuario (pantalla de importación; RLS aplica). Repetible sin duplicar:
 * cada fila lleva `external_id` «profity:…» y el stock, diseños y reglas usan upsert sin sobrescribir.
 */
const chunk = <T,>(xs: T[], n = 400) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const eur = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export type ReconRow = { tabla: string; "origen nº": number; "destino nº": number; origen: string; destino: string; resultado: string };
export type ApplyResult = { imported: { orders: number; expenses: number; incomes: number; ordersExisting: number; expensesExisting: number; incomesExisting: number }; rows: ReconRow[]; ok: boolean };

export async function applyProfityPlan(
  sb: SupabaseClient<Database>, target: { workspaceId: string; userId: string }, plan: Plan, names: { main: string; vinted: string },
): Promise<ApplyResult> {
  const ws = target.workspaceId;
  const base = { workspace_id: ws, user_id: target.userId };
  const mainName = names.main;
  const vintedName = names.vinted;

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

  // Producción (stock, diseños, reglas, facturas). Los upserts con onConflict no duplican.
  const pr = plan.production;
  const hasProduction = pr.tshirtStocks.length + pr.dtfStocks.length + pr.designs.length > 0;
  if (hasProduction) {
    const { error: pe } = await sb.from("businesses").update({ production_enabled: true }).eq("id", biz.main);
    if (pe) throw pe;
    const b = { ...base, business_id: biz.main };
    for (const c of chunk(pr.tshirtStocks)) {
      const { error } = await sb.from("tshirt_stocks").upsert(c.map((t) => ({ ...b, ...t })), { onConflict: "business_id,model,size", ignoreDuplicates: true });
      if (error) throw error;
    }
    for (const c of chunk(pr.designs)) {
      const { error } = await sb.from("dtf_designs").upsert(c.map((d) => ({ ...b, ...d })), { onConflict: "business_id,name", ignoreDuplicates: true });
      if (error) throw error;
    }
    for (const c of chunk(pr.dtfStocks)) {
      const { error } = await sb.from("dtf_stocks").upsert(c.map((d) => ({ ...b, ...d })), { onConflict: "business_id,name,variant", ignoreDuplicates: true });
      if (error) throw error;
    }
    for (const c of chunk(pr.shirtRules)) {
      const { error } = await sb.from("shirt_dtf_rules").upsert(c.map((r) => ({ ...b, ...r })), { onConflict: "business_id,shirt_color_key", ignoreDuplicates: true });
      if (error) throw error;
    }
    for (const c of chunk(pr.designRules)) {
      const { error } = await sb.from("design_dtf_rules").upsert(c.map((r) => ({ ...b, ...r })), { onConflict: "business_id,design", ignoreDuplicates: true });
      if (error) throw error;
    }
    const { data: haveInv } = await sb.from("invoices").select("external_id").eq("workspace_id", ws).like("external_id", "profity:%");
    const haveInvIds = new Set((haveInv ?? []).map((r) => r.external_id));
    const newInv = pr.invoices.filter((i) => !haveInvIds.has(i.external_id));
    for (const c of chunk(newInv)) {
      const { error } = await sb.from("invoices").insert(c.map((i) => ({ ...b, ...i })));
      if (error) throw error;
    }
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
  const imported = { orders: newO.length, expenses: newE.length, incomes: newI.length, ordersExisting: plan.orders.length - newO.length, expensesExisting: plan.expenses.length - newE.length, incomesExisting: plan.incomes.length - newI.length };

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
  const sumStock = async (table: "tshirt_stocks" | "dtf_stocks") => {
    const { data, error } = await sb.from(table).select("quantity").eq("workspace_id", ws).eq("business_id", biz.main).limit(10000);
    if (error) throw error;
    return { count: data.length, totalCents: data.reduce((s, r) => s + r.quantity, 0) };
  };
  const countInvoices = async () => {
    const { count, error } = await sb.from("invoices").select("id", { count: "exact", head: true }).eq("workspace_id", ws).like("external_id", "profity:%");
    if (error) throw error;
    return { count: count ?? 0, totalCents: 0 };
  };
  const exp = expectedTotals(plan);
  const got = { orders: await sumAll("orders", "total_cents"), ordersActive: await sumAll("orders", "total_cents", true), expenses: await sumAll("expenses", "amount_cents"), incomes: await sumAll("incomes", "amount_cents"), tshirtStocks: await sumStock("tshirt_stocks"), dtfStocks: await sumStock("dtf_stocks"), invoices: await countInvoices() };
  const rows = (Object.keys(exp) as (keyof typeof exp)[]).map((k) => ({
    tabla: k, "origen nº": exp[k].count, "destino nº": got[k].count, "origen": k.endsWith("Stocks") ? `${exp[k].totalCents} uds` : eur(exp[k].totalCents), "destino": k.endsWith("Stocks") ? `${got[k].totalCents} uds` : eur(got[k].totalCents),
    resultado: exp[k].count === got[k].count && exp[k].totalCents === got[k].totalCents ? "✔ coincide" : "✘ NO coincide",
  }));
  const ok = !rows.some((r) => r.resultado.startsWith("✘"));
  return { imported, rows, ok };
}

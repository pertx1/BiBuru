import "server-only";
import { getContext } from "@/lib/context";
import { previousPeriod, type Period } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";

export type Business = Database["public"]["Tables"]["businesses"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];
export type Order = Database["public"]["Tables"]["orders"]["Row"] & { order_items: OrderItem[] };
export type Expense = Database["public"]["Tables"]["expenses"]["Row"] & {
  expense_categories: { name: string; color: string } | null;
};
export type Income = Database["public"]["Tables"]["incomes"]["Row"];
export type Category = Database["public"]["Tables"]["expense_categories"]["Row"];

export const PAGE_SIZE = 100;

function fail(what: string, error: { message: string } | null): never {
  console.error(`[data] ${what}:`, error?.message);
  throw new Error(`No se pudo cargar: ${what}`);
}

export async function listBusinesses(includeArchived = false): Promise<Business[]> {
  const { supabase, workspaceId } = await getContext();
  let q = supabase.from("businesses").select("*").eq("workspace_id", workspaceId).order("sort_order").order("created_at");
  if (!includeArchived) q = q.eq("archived", false);
  const { data, error } = await q;
  if (error) fail("negocios", error);
  return data;
}

export async function getBusiness(id: string): Promise<Business | null> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("businesses").select("*").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  if (error) fail("negocio", error);
  return data;
}

export type Totals = { income: number; expense: number; profit: number; orders: number };
const emptyTotals = (): Totals => ({ income: 0, expense: 0, profit: 0, orders: 0 });

/** Totales por negocio en un periodo (una sola consulta SQL). */
export async function getTotalsByBusiness(period: Period): Promise<Map<string, Totals>> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.rpc("stats_totals", { ws: workspaceId, p_from: period.from, p_to: period.to });
  if (error) fail("totales", error);
  return new Map(
    data.map((r) => [
      r.business_id,
      { income: r.income_cents, expense: r.expense_cents, profit: r.income_cents - r.expense_cents, orders: r.orders_count },
    ]),
  );
}

export function sumTotals(map: Map<string, Totals>, only?: string[]): Totals {
  const t = emptyTotals();
  for (const [id, v] of map) {
    if (only && !only.includes(id)) continue;
    t.income += v.income; t.expense += v.expense; t.profit += v.profit; t.orders += v.orders;
  }
  return t;
}

export async function getTotalsWithPrevious(period: Period, businessId?: string) {
  const [cur, prev] = await Promise.all([getTotalsByBusiness(period), getTotalsByBusiness(previousPeriod(period))]);
  const only = businessId ? [businessId] : undefined;
  return { current: sumTotals(cur, only), previous: sumTotals(prev, only), byBusiness: cur, previousByBusiness: prev };
}

export async function getMonthlySeries(period: Period, businessId?: string) {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.rpc("stats_monthly", {
    ws: workspaceId, p_from: period.from, p_to: period.to, p_business: businessId,
  });
  if (error) fail("serie mensual", error);
  return data.map((r) => ({ month: r.month, income: r.income_cents, expense: r.expense_cents, profit: r.income_cents - r.expense_cents }));
}

export async function getTopProducts(period: Period, groupBy: "product" | "size" | "color", businessId?: string) {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.rpc("stats_top_products", {
    ws: workspaceId, p_from: period.from, p_to: period.to, p_business: businessId, group_by: groupBy, max_rows: 8,
  });
  if (error) fail("productos más vendidos", error);
  return data.map((r) => ({ label: r.label, units: r.units, revenue: r.revenue_cents }));
}

export async function getExpensesByCategory(period: Period, businessId?: string) {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.rpc("stats_expenses_by_category", {
    ws: workspaceId, p_from: period.from, p_to: period.to, p_business: businessId, max_rows: 8,
  });
  if (error) fail("gastos por categoría", error);
  return data.map((r) => ({ label: r.label, color: r.color, amount: r.amount_cents }));
}

export type OrderFilters = { status?: string; from?: string; to?: string; q?: string; limit?: number };

const escapeLike = (s: string) => s.replace(/[\\%_,()]/g, " ").trim();

export async function listOrders(businessId: string, f: OrderFilters = {}): Promise<Order[]> {
  const { supabase, workspaceId } = await getContext();
  let q = supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("workspace_id", workspaceId)
    .eq("business_id", businessId)
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(f.limit ?? PAGE_SIZE);
  if (f.status) q = q.eq("status", f.status);
  if (f.from) q = q.gte("order_date", f.from);
  if (f.to) q = q.lte("order_date", f.to);
  if (f.q && escapeLike(f.q)) {
    const t = escapeLike(f.q);
    q = q.or(`customer.ilike.%${t}%,order_number.ilike.%${t}%`);
  }
  const { data, error } = await q;
  if (error) fail("pedidos", error);
  return data as Order[];
}

export async function getOrder(businessId: string, orderId: string): Promise<Order | null> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase
    .from("orders").select("*, order_items(*)")
    .eq("workspace_id", workspaceId).eq("business_id", businessId).eq("id", orderId).maybeSingle();
  if (error) fail("pedido", error);
  return data as Order | null;
}

export type ExpenseFilters = { category?: string; from?: string; to?: string; q?: string; limit?: number };

export async function listExpenses(businessId: string, f: ExpenseFilters = {}): Promise<Expense[]> {
  const { supabase, workspaceId } = await getContext();
  let q = supabase
    .from("expenses")
    .select("*, expense_categories(name, color)")
    .eq("workspace_id", workspaceId)
    .eq("business_id", businessId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(f.limit ?? PAGE_SIZE);
  if (f.category) q = q.eq("category_id", f.category);
  if (f.from) q = q.gte("expense_date", f.from);
  if (f.to) q = q.lte("expense_date", f.to);
  if (f.q && escapeLike(f.q)) {
    const t = escapeLike(f.q);
    q = q.or(`concept.ilike.%${t}%,supplier.ilike.%${t}%`);
  }
  const { data, error } = await q;
  if (error) fail("gastos", error);
  return data as Expense[];
}

export async function listIncomes(businessId: string, limit = PAGE_SIZE): Promise<Income[]> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase
    .from("incomes").select("*").eq("workspace_id", workspaceId).eq("business_id", businessId)
    .order("income_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  if (error) fail("ingresos", error);
  return data;
}

export async function listCategories(): Promise<Category[]> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("expense_categories").select("*").eq("workspace_id", workspaceId).order("name");
  if (error) fail("categorías", error);
  return data;
}

export async function listProducts(businessId: string): Promise<Product[]> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase
    .from("products").select("*").eq("workspace_id", workspaceId).eq("business_id", businessId).order("name");
  if (error) fail("productos", error);
  return data;
}

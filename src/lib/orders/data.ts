import "server-only";
import { getContext } from "@/lib/context";
import type { Order } from "@/lib/data";
import type { Database } from "@/lib/supabase/database.types";
import type { DueOrder, OrderFilters } from "./payments";

export type Payment = Database["public"]["Tables"]["order_payments"]["Row"];
export type OrderWithPayments = Order & { order_payments: Payment[] };

const like = (s: string) => s.replace(/[\\%_,()]/g, " ").trim();

/** Ids de pedidos con alguna línea cuyo producto contiene el texto (para el filtro por producto). */
async function orderIdsByProduct(businessId: string, product: string): Promise<string[]> {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase.from("order_items").select("order_id, orders!inner(business_id)").eq("workspace_id", workspaceId)
    .eq("orders.business_id", businessId).ilike("product_name", `%${like(product)}%`).limit(3000);
  return [...new Set((data ?? []).map((r) => r.order_id))];
}

/** Aplica los filtros a una consulta de pedidos (lista o totales). */
async function filtered<Q extends { eq: (c: string, v: unknown) => Q; gte: (c: string, v: unknown) => Q; lte: (c: string, v: unknown) => Q; gt: (c: string, v: unknown) => Q; neq: (c: string, v: unknown) => Q; in: (c: string, v: unknown[]) => Q; ilike: (c: string, v: string) => Q; or: (f: string) => Q }>(q: Q, businessId: string, f: OrderFilters): Promise<Q> {
  if (f.status) q = q.eq("status", f.status);
  if (f.from) q = q.gte("order_date", f.from);
  if (f.to) q = q.lte("order_date", f.to);
  if (f.channel) q = q.ilike("channel", `%${like(f.channel)}%`);
  if (f.customer) q = q.ilike("customer", `%${like(f.customer)}%`);
  if (f.pay === "unreviewed") q = q.eq("payment_reviewed", false).neq("status", "cancelado");
  if (f.pay === "paid") q = q.eq("payment_reviewed", true).eq("due_cents", 0).neq("status", "cancelado");
  if (f.pay === "pending") q = q.gt("due_cents", 0).eq("paid_cents", 0);
  if (f.pay === "partial") q = q.gt("due_cents", 0).gt("paid_cents", 0);
  const ids = f.product ? await orderIdsByProduct(businessId, f.product) : null;
  if (f.q && like(f.q)) {
    // Buscador: cliente, nº de pedido o producto.
    const t = like(f.q);
    const byProduct = await orderIdsByProduct(businessId, t);
    q = q.or([`customer.ilike.%${t}%`, `order_number.ilike.%${t}%`, ...(byProduct.length ? [`id.in.(${byProduct.slice(0, 500).join(",")})`] : [])].join(","));
  }
  if (ids) q = q.in("id", ids.length ? ids.slice(0, 1000) : ["00000000-0000-0000-0000-000000000000"]);
  return q;
}

export async function listOrdersFiltered(businessId: string, f: OrderFilters, limit: number): Promise<Order[]> {
  const { supabase, workspaceId } = await getContext();
  const base = supabase.from("orders").select("*, order_items(*)").eq("workspace_id", workspaceId).eq("business_id", businessId)
    .order("order_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  const { data, error } = await (await filtered(base as never, businessId, f) as typeof base);
  if (error) throw new Error(`pedidos: ${error.message}`);
  return data as Order[];
}

/** Importes de todos los pedidos que cumplen el filtro (para los totales de lo filtrado). */
export async function filteredOrderAmounts(businessId: string, f: OrderFilters) {
  const { supabase, workspaceId } = await getContext();
  const base = supabase.from("orders").select("status, payment_reviewed, total_cents, cost_cents, paid_cents, due_cents").eq("workspace_id", workspaceId).eq("business_id", businessId).limit(20000);
  const { data, error } = await (await filtered(base as never, businessId, f) as typeof base);
  if (error) throw new Error(`totales: ${error.message}`);
  return data;
}

export async function getOrderWithPayments(businessId: string, orderId: string): Promise<OrderWithPayments | null> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("orders").select("*, order_items(*), order_payments(*)")
    .eq("workspace_id", workspaceId).eq("business_id", businessId).eq("id", orderId).maybeSingle();
  if (error) throw new Error(`pedido: ${error.message}`);
  return data as OrderWithPayments | null;
}

/** Pedidos con algo pendiente de cobro (de un negocio o de todos). */
export async function listDueOrders(businessId?: string): Promise<DueOrder[]> {
  const { supabase, workspaceId } = await getContext();
  let q = supabase.from("orders").select("id, customer, order_number, order_date, due_cents, business_id").eq("workspace_id", workspaceId).gt("due_cents", 0).order("order_date").limit(5000);
  if (businessId) q = q.eq("business_id", businessId);
  const { data, error } = await q;
  if (error) throw new Error(`deudas: ${error.message}`);
  return data.map((o) => ({ ...o, due_cents: Number(o.due_cents ?? 0) }));
}

export async function countUnreviewed(businessId: string): Promise<number> {
  const { supabase, workspaceId } = await getContext();
  const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("business_id", businessId)
    .eq("payment_reviewed", false).neq("status", "cancelado");
  return count ?? 0;
}

/** Cobrado frente a pendiente por mes (misma estética que el Resumen financiero). */
export async function getCollections(from: string, to: string, businessId?: string) {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.rpc("stats_collections", { ws: workspaceId, p_from: from, p_to: to, p_business: businessId });
  if (error) throw new Error(`cobros: ${error.message}`);
  return data.map((r) => ({ month: r.month, collected: Number(r.collected_cents), pending: Number(r.pending_cents) }));
}

/** Clientes y canales usados (para sugerencias en los filtros). */
export async function orderFacets(businessId: string) {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase.from("orders").select("customer, channel").eq("workspace_id", workspaceId).eq("business_id", businessId).order("order_date", { ascending: false }).limit(2000);
  const uniq = (xs: (string | null)[]) => [...new Set(xs.map((x) => x?.trim()).filter(Boolean) as string[])].slice(0, 200);
  return { customers: uniq((data ?? []).map((r) => r.customer)), channels: uniq((data ?? []).map((r) => r.channel)) };
}

/** Nº de pedidos por estado con el resto de filtros aplicados (botones de estado como en PROFITY). */
export async function countByStatus(businessId: string, f: OrderFilters, statuses: readonly string[]): Promise<Record<string, number>> {
  const { supabase, workspaceId } = await getContext();
  const rest = { ...f, status: undefined };
  const counts = await Promise.all(statuses.map(async (s) => {
    const base = supabase.from("orders").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("business_id", businessId).eq("status", s);
    const { count } = await (await filtered(base as never, businessId, rest) as typeof base);
    return [s, count ?? 0] as const;
  }));
  return Object.fromEntries(counts);
}

import "server-only";
import { getContext } from "@/lib/context";
import type { Database } from "@/lib/supabase/database.types";
import type { Catalog, DesignKind, DtfVariant, Rules } from "./catalog";
import { buildPrintBag, type BagLine, type BagOrder } from "./print-bag";
import { computeStockOverview, type PendingItem } from "./stock";

export type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
export type ShirtRule = Database["public"]["Tables"]["shirt_dtf_rules"]["Row"];
export type DesignRule = Database["public"]["Tables"]["design_dtf_rules"]["Row"];

function fail(what: string, e: { message: string } | null): never {
  console.error(`[production] ${what}:`, e?.message);
  throw new Error(`No se pudo cargar: ${what}`);
}

export async function loadBase(businessId: string) {
  const { supabase, workspaceId } = await getContext();
  const [tshirts, designs, dtfs, shirtRules, designRules] = await Promise.all([
    supabase.from("tshirt_stocks").select("*").eq("workspace_id", workspaceId).eq("business_id", businessId),
    supabase.from("dtf_designs").select("*").eq("workspace_id", workspaceId).eq("business_id", businessId),
    supabase.from("dtf_stocks").select("*").eq("workspace_id", workspaceId).eq("business_id", businessId),
    supabase.from("shirt_dtf_rules").select("*").eq("workspace_id", workspaceId).eq("business_id", businessId),
    supabase.from("design_dtf_rules").select("*").eq("workspace_id", workspaceId).eq("business_id", businessId),
  ]);
  if (tshirts.error) fail("stock de prendas", tshirts.error);
  if (designs.error) fail("diseños", designs.error);
  if (dtfs.error) fail("stock DTF", dtfs.error);
  if (shirtRules.error) fail("reglas", shirtRules.error);
  if (designRules.error) fail("reglas de diseño", designRules.error);
  const models: string[] = [];
  for (const t of tshirts.data) if (!models.includes(t.model)) models.push(t.model);
  const catalog: Catalog = { models, designs: designs.data.map((d) => ({ name: d.name, kind: d.kind as DesignKind })).sort((a, b) => a.name.localeCompare(b.name, "es")) };
  const rules: Rules = {
    shirt: shirtRules.data.map((r) => ({ shirtColorKey: r.shirt_color_key, dtfColor: r.dtf_color })),
    design: designRules.data.map((r) => ({ design: r.design, dtfColor: r.dtf_color })),
  };
  return {
    catalog, rules, shirtRules: shirtRules.data, designRules: designRules.data,
    rows: {
      tshirts: tshirts.data.map((t) => ({ model: t.model, size: t.size, quantity: t.quantity })),
      dtfs: dtfs.data.map((d) => ({ name: d.name, variant: d.variant as DtfVariant, quantity: d.quantity })),
    },
  };
}

/** Líneas de pedidos en los estados dados (con su pedido). */
async function loadOrderItems(businessId: string, statuses: string[]) {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, order_date, order_items(product_name, color, size, quantity)")
    .eq("workspace_id", workspaceId).eq("business_id", businessId).in("status", statuses)
    .order("order_date", { ascending: true }).limit(5000);
  if (error) fail("pedidos pendientes", error);
  return data;
}

export async function getStockOverview(businessId: string) {
  const [base, orders] = await Promise.all([loadBase(businessId), loadOrderItems(businessId, ["sin_hacer", "sin_llegar"])]);
  const pending: PendingItem[] = orders.flatMap((o) => o.order_items.map((i) => ({ product_name: i.product_name, color: i.color, size: i.size, quantity: i.quantity })));
  return { ...computeStockOverview(base.rows, pending, base.catalog, base.rules), catalog: base.catalog };
}

export type CheckedBagLine = BagLine & { checked: boolean; changed: boolean };

export async function getPrintBagData(businessId: string) {
  const { supabase, workspaceId } = await getContext();
  const [base, orders, checks] = await Promise.all([
    loadBase(businessId),
    loadOrderItems(businessId, ["sin_hacer"]),
    supabase.from("print_bag_checks").select("key, quantity").eq("workspace_id", workspaceId).eq("business_id", businessId),
  ]);
  if (checks.error) fail("bolsa", checks.error);
  const bagOrders: BagOrder[] = orders.flatMap((o) =>
    o.order_items.map((i) => ({ id: o.id, orderNumber: o.order_number, model: i.product_name, color: i.color, size: i.size, quantity: i.quantity })),
  );
  const bag = buildPrintBag(bagOrders, base.rules, base.catalog);
  const byKey = new Map(checks.data.map((c) => [c.key, c.quantity]));
  const mark = (lines: BagLine[]): CheckedBagLine[] =>
    lines.map((l) => {
      const q = byKey.get(l.key);
      return { ...l, checked: q === l.quantity, changed: q !== undefined && q !== l.quantity };
    });
  return { ...bag, shirts: mark(bag.shirts), dtfs: mark(bag.dtfs) };
}

export async function getRulesData(businessId: string) {
  const base = await loadBase(businessId);
  const { supabase, workspaceId } = await getContext();
  const { data: token } = await supabase.from("api_tokens").select("created_at").eq("workspace_id", workspaceId).eq("business_id", businessId).eq("kind", "antola").maybeSingle();
  return { catalog: base.catalog, shirtRules: base.shirtRules, designRules: base.designRules, antolaCreatedAt: token?.created_at ?? null };
}

export async function listInvoices(businessId: string): Promise<Invoice[]> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("invoices").select("*").eq("workspace_id", workspaceId).eq("business_id", businessId).order("created_at", { ascending: false });
  if (error) fail("facturas", error);
  return data;
}

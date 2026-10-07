import "server-only";
import { getContext } from "@/lib/context";
import { nowLocal } from "@/lib/dates";
import type { DtfVariant } from "@/lib/production/catalog";
import { loadBase } from "@/lib/production/data";
import { garmentLabel, resolveStockEffect } from "@/lib/production/stock";
import { itemLabel, planTasks, reserveGeneric, shortages, withMissing, type GenericItem, type PendingLine, type StockEntry, type StockLine } from "./shortage";

/** Estados de pedido que reservan stock (los mismos que Producción: aún no hecho o sin llegar). */
export const RESERVING = ["sin_hacer", "sin_llegar"];

const DTF_LABEL: Record<DtfVariant, string> = { UNICO: "", BLANCO: " blanco", NEGRO: " negro" };
export const tshirtKey = (model: string, size: string) => `tshirt|${model}|${size}`;
export const dtfKey = (name: string, variant: string) => `dtf|${name}|${variant}`;
export const itemKey = (id: string) => `item|${id}`;

export type GenericRow = GenericItem & { quantity: number; min_quantity: number };

async function pendingLines(businessId: string): Promise<PendingLine[]> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("orders").select("order_date, order_items(product_id, product_name, color, size, quantity)")
    .eq("workspace_id", workspaceId).eq("business_id", businessId).in("status", RESERVING).limit(5000);
  if (error) throw new Error(`stock: pedidos pendientes: ${error.message}`);
  return data.flatMap((o) => o.order_items.map((i) => ({ ...i, order_date: o.order_date })));
}

/** Todo el inventario de un negocio (prendas y DTF de Producción si está activa + artículos genéricos) con lo reservado. */
export async function loadInventory(businessId: string): Promise<{ lines: StockLine[]; items: GenericRow[]; production: boolean }> {
  const { supabase, workspaceId } = await getContext();
  const [{ data: biz }, lines, { data: items, error }] = await Promise.all([
    supabase.from("businesses").select("production_enabled").eq("id", businessId).eq("workspace_id", workspaceId).maybeSingle(),
    pendingLines(businessId),
    supabase.from("stock_items").select("id, name, variant, product_id, match_color, match_size, quantity, min_quantity").eq("workspace_id", workspaceId).eq("business_id", businessId).order("name").order("variant"),
  ]);
  if (error) throw new Error(`stock: artículos: ${error.message}`);
  const entries: StockEntry[] = [];

  if (biz?.production_enabled) {
    const [base, mins] = await Promise.all([
      loadBase(businessId),
      Promise.all([
        supabase.from("tshirt_stocks").select("model, size, min_quantity").eq("workspace_id", workspaceId).eq("business_id", businessId),
        supabase.from("dtf_stocks").select("name, variant, min_quantity").eq("workspace_id", workspaceId).eq("business_id", businessId),
      ]),
    ]);
    const min = new Map<string, number>([
      ...(mins[0].data ?? []).map((r) => [tshirtKey(r.model, r.size), r.min_quantity] as const),
      ...(mins[1].data ?? []).map((r) => [dtfKey(r.name, r.variant), r.min_quantity] as const),
    ]);
    const demand = new Map<string, { q: number; oldest: string }>();
    const add = (k: string, q: number, d: string) => { const x = demand.get(k); demand.set(k, { q: (x?.q ?? 0) + q, oldest: x && x.oldest < d ? x.oldest : d }); };
    for (const l of lines) {
      const e = resolveStockEffect(l, base.catalog, base.rules);
      if (e.tshirt) add(tshirtKey(e.tshirt.model, e.tshirt.size), l.quantity, l.order_date);
      if (e.dtf) add(dtfKey(e.dtf.name, e.dtf.variant), l.quantity, l.order_date);
    }
    const kindOf = new Map(base.catalog.designs.map((d) => [d.name, d.kind]));
    for (const t of base.rows.tshirts) {
      const k = tshirtKey(t.model, t.size), d = demand.get(k);
      entries.push({ key: k, group: "prendas", label: `${garmentLabel(t.model)} ${t.size}`, base: t.quantity, min: min.get(k) ?? 0, reserved: d?.q ?? 0, oldestOrder: d?.oldest ?? null });
    }
    for (const t of base.rows.dtfs) {
      const kind = kindOf.get(t.name);
      if (!kind || (kind === "standalone") !== (t.variant === "UNICO")) continue; // fuera del catálogo
      const k = dtfKey(t.name, t.variant), d = demand.get(k);
      entries.push({ key: k, group: "dtf", label: `DTF ${t.name}${DTF_LABEL[t.variant]}`, base: t.quantity, min: min.get(k) ?? 0, reserved: d?.q ?? 0, oldestOrder: d?.oldest ?? null });
    }
  }
  for (const i of items ?? []) {
    const r = reserveGeneric(i, lines);
    entries.push({ key: itemKey(i.id), group: "articulos", label: itemLabel(i), base: i.quantity, min: i.min_quantity, reserved: r.reserved, oldestOrder: r.oldestOrder });
  }
  return { lines: entries.map(withMissing), items: items ?? [], production: !!biz?.production_enabled };
}

/**
 * Mantiene las tareas «Reponer: …» del negocio: crea las que faltan, actualiza cantidad/fecha y completa las repuestas.
 * Nunca lanza: si algo falla (p. ej. base sin la migración de stock) se registra y la acción que la llamó sigue.
 */
export async function syncStockTasks(businessId: string): Promise<{ created: number; updated: number; completed: number } | null> {
  try {
    const { supabase, workspaceId, userId, timezone } = await getContext();
    const today = nowLocal(new Date(), timezone).date;
    const [{ lines }, { data: open, error }] = await Promise.all([
      loadInventory(businessId),
      supabase.from("tasks").select("id, stock_key, stock_missing, title, due_date").eq("workspace_id", workspaceId).eq("business_id", businessId).eq("status", "open").not("stock_key", "is", null),
    ]);
    if (error) throw new Error(error.message);
    const plan = planTasks(shortages(lines), (open ?? []).map((t) => ({ ...t, stock_key: t.stock_key! })), today);
    if (plan.create.length) {
      const { error: e } = await supabase.from("tasks").insert(plan.create.map((c) => ({
        workspace_id: workspaceId, user_id: userId, business_id: businessId, title: c.title, due_date: c.due, priority: 2,
        stock_key: c.key, stock_missing: c.missing,
        notes: "Tarea automática de Stock: se actualiza sola y se completa cuando repones. Al completarla a mano te preguntará cuántas unidades han entrado.",
      })));
      if (e && e.code !== "23505") throw new Error(e.message); // 23505: otra pasada la creó a la vez
    }
    for (const u of plan.update) await supabase.from("tasks").update({ title: u.title, stock_missing: u.missing, due_date: u.due }).eq("id", u.id).eq("workspace_id", workspaceId);
    if (plan.complete.length) {
      await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString(), stock_missing: 0 })
        .in("id", plan.complete.map((c) => c.id)).eq("workspace_id", workspaceId);
    }
    return { created: plan.create.length, updated: plan.update.length, completed: plan.complete.length };
  } catch (e) {
    console.error("[stock] sync", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Cambia el stock base de un artículo (cualquier tipo): suma `delta` o lo deja en `set`, y apunta el movimiento. */
export async function moveStock(businessId: string, key: string, change: { delta: number } | { set: number }, kind: "entrada" | "salida" | "ajuste", reason: string | null, label: string): Promise<string | null> {
  let delta = 0;
  const { supabase, workspaceId, userId, timezone } = await getContext();
  const [type, a, b] = key.split("|");
  const bump = async (table: "tshirt_stocks" | "dtf_stocks" | "stock_items", filter: Record<string, string>) => {
    let q = supabase.from(table).select("id, quantity").eq("workspace_id", workspaceId).eq("business_id", businessId);
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    const { data } = await q.maybeSingle();
    if (!data) return "Artículo no encontrado";
    delta = "set" in change ? change.set - data.quantity : change.delta;
    if (delta === 0) return null;
    const { error } = await supabase.from(table).update({ quantity: data.quantity + delta }).eq("id", data.id).eq("workspace_id", workspaceId);
    return error ? "No se pudo guardar el stock" : null;
  };
  const err = type === "tshirt" ? await bump("tshirt_stocks", { model: a, size: b })
    : type === "dtf" ? await bump("dtf_stocks", { name: a, variant: b })
    : type === "item" ? await bump("stock_items", { id: a })
    : "Artículo no válido";
  if (err) return err;
  if (delta === 0) return null;
  await supabase.from("stock_movements").insert({ workspace_id: workspaceId, user_id: userId, business_id: businessId, item_key: key, label: label.slice(0, 200), kind, delta, reason, moved_on: nowLocal(new Date(), timezone).date });
  return null;
}

import "server-only";
import { getContext } from "@/lib/context";
import { nowLocal } from "@/lib/dates";
import type { DtfVariant } from "@/lib/production/catalog";
import { loadBase } from "@/lib/production/data";
import { garmentLabel, resolveStockEffect } from "@/lib/production/stock";
import { dtfKey, itemKey, resolveLineStock, stockOptions, tshirtKey, type StockLinkContext } from "./link";
import { itemLabel, planTasks, reserveGeneric, shortages, withMissing, type GenericItem, type PendingLine, type StockEntry, type StockLine } from "./shortage";

export { dtfKey, itemKey, tshirtKey };

/** Estados de pedido que reservan stock (los mismos que Producción: aún no hecho o sin llegar). */
export const RESERVING = ["sin_hacer", "sin_llegar"];

const DTF_LABEL: Record<DtfVariant, string> = { UNICO: "", BLANCO: " blanco", NEGRO: " negro" };

export type GenericRow = GenericItem & { quantity: number; min_quantity: number };

/**
 * Líneas de pedidos pendientes que RESERVAN stock: solo las «sin vincular» (pedidos anteriores al descuento automático o texto libre).
 * Las vinculadas ya se descontaron del stock al crear el pedido: contarlas aquí sería restarlas dos veces.
 */
async function pendingLines(businessId: string): Promise<PendingLine[]> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("orders").select("order_date, order_items(product_id, product_name, color, size, quantity, stock_effects)")
    .eq("workspace_id", workspaceId).eq("business_id", businessId).in("status", RESERVING).limit(5000);
  if (error) throw new Error(`stock: pedidos pendientes: ${error.message}`);
  return data.flatMap((o) => o.order_items.filter((i) => i.stock_effects == null).map(({ stock_effects: _e, ...i }) => ({ ...i, order_date: o.order_date }))); // eslint-disable-line @typescript-eslint/no-unused-vars
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
 * Mantiene las tareas «Pedir …» del negocio como BATU con Profity (ver `planTasks`): crea las que faltan (para hoy, prioridad alta),
 * actualiza la nota con la cantidad, no repite las que tachaste mientras siga faltando y completa solas las que ya tienen stock.
 * Nunca lanza: si algo falla (p. ej. base sin la migración de stock) se registra y la acción que la llamó sigue.
 */
export async function syncStockTasks(businessId: string): Promise<{ created: number; updated: number; completed: number } | null> {
  try {
    const { supabase, workspaceId, userId, timezone } = await getContext();
    const now = new Date();
    const today = nowLocal(now, timezone).date;
    const [{ lines }, { data: tasks, error }] = await Promise.all([
      loadInventory(businessId),
      // Abiertas y tachadas: una tachada «guarda» su artículo para no volver a crearlo mientras siga faltando.
      supabase.from("tasks").select("id, stock_key, stock_missing, notes, status").eq("workspace_id", workspaceId).eq("business_id", businessId).not("stock_key", "is", null).limit(2000),
    ]);
    if (error) throw new Error(error.message);
    const plan = planTasks(shortages(lines), (tasks ?? []).map((t) => ({ ...t, stock_key: t.stock_key! })));
    if (plan.create.length) {
      const { error: e } = await supabase.from("tasks").insert(plan.create.map((c) => ({
        workspace_id: workspaceId, user_id: userId, business_id: businessId, title: c.title, notes: c.notes, due_date: today, priority: 3,
        stock_key: c.key, stock_missing: c.missing, external_key: `stock:${businessId}:${c.key}`, // «origen:clave» como Antola
      })));
      if (e && e.code !== "23505") throw new Error(e.message); // 23505: otra pasada la creó a la vez
    }
    for (const u of plan.update) await supabase.from("tasks").update({ notes: u.notes, stock_missing: u.missing }).eq("id", u.id).eq("workspace_id", workspaceId);
    let completed = 0;
    for (const r of plan.release) {
      const t = (tasks ?? []).find((x) => x.id === r.id);
      await supabase.from("tasks").update(r.complete
        ? { stock_key: null, external_key: null, status: "done", completed_at: now.toISOString(), remind_at: null, stock_missing: 0, notes: `${t?.notes ?? ""}\nCompletada sola: ya hay stock.`.trim().slice(0, 5000) }
        : { stock_key: null, external_key: null }).eq("id", r.id).eq("workspace_id", workspaceId);
      if (r.complete) completed++;
    }
    return { created: plan.create.length, updated: plan.update.length, completed };
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

/** Todos los negocios activos que tienen inventario (Producción activa o artículos de Stock). Nunca lanza. */
export async function syncAllStockTasks() {
  try {
    const { supabase, workspaceId } = await getContext();
    const [{ data: biz }, { data: items }] = await Promise.all([
      supabase.from("businesses").select("id, production_enabled").eq("workspace_id", workspaceId).eq("archived", false),
      supabase.from("stock_items").select("business_id").eq("workspace_id", workspaceId).limit(5000),
    ]);
    const withItems = new Set((items ?? []).map((i) => i.business_id));
    await Promise.all((biz ?? []).filter((b) => b.production_enabled || withItems.has(b.id)).map((b) => syncStockTasks(b.id)));
  } catch (e) { console.error("[stock] syncAll", e instanceof Error ? e.message : e); }
}

/** Catálogo, reglas y artículos del negocio para saber qué descuenta cada línea de pedido (`resolveLineStock`). */
export async function loadStockLinkContext(businessId: string): Promise<StockLinkContext> {
  const { supabase, workspaceId } = await getContext();
  const [{ data: biz }, { data: items }] = await Promise.all([
    supabase.from("businesses").select("production_enabled").eq("id", businessId).eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("stock_items").select("id, name, variant, product_id, match_color, match_size").eq("workspace_id", workspaceId).eq("business_id", businessId).order("name").order("variant"),
  ]);
  const generic = (items ?? []) as GenericItem[];
  if (!biz?.production_enabled) return { production: null, items: generic, options: stockOptions(null, generic) };
  const base = await loadBase(businessId);
  return { production: { catalog: base.catalog, rules: base.rules }, items: generic, options: stockOptions(base, generic) };
}

export type RecalcMode = "pendientes" | "desde";
export type RecalcPreview = {
  orders: number;            // pedidos que pasarían a descontar
  unlinkedLines: number;     // líneas que no encajan con ningún artículo (no descuentan)
  rows: { key: string; label: string; now: number; minus: number; after: number }[];
};

/** Pedidos anteriores que aún no descuentan (ninguna línea vinculada), no cancelados, según el modo. */
async function legacyOrders(businessId: string, mode: RecalcMode, from: string | null) {
  const { supabase, workspaceId } = await getContext();
  let q = supabase.from("orders").select("id, order_date, status, order_items(id, product_id, product_name, color, size, quantity, stock_key, stock_effects)")
    .eq("workspace_id", workspaceId).eq("business_id", businessId).neq("status", "cancelado").order("order_date").limit(3000);
  q = mode === "pendientes" ? q.in("status", RESERVING) : q.gte("order_date", from ?? "1900-01-01");
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data.filter((o) => o.order_items.length > 0 && o.order_items.every((i) => i.stock_effects == null));
}

/** Vista previa de «Recalcular desde pedidos»: cuánto bajaría cada artículo. No cambia nada. */
export async function recalcPreview(businessId: string, mode: RecalcMode, from: string | null): Promise<RecalcPreview> {
  const [ctx, orders, inv] = await Promise.all([loadStockLinkContext(businessId), legacyOrders(businessId, mode, from), loadInventory(businessId)]);
  const minus = new Map<string, { label: string; qty: number }>();
  let unlinked = 0;
  for (const o of orders) for (const i of o.order_items) {
    const eff = resolveLineStock(i, ctx);
    if (!eff.length) unlinked++;
    for (const e of eff) { const x = minus.get(e.key); minus.set(e.key, { label: e.label, qty: (x?.qty ?? 0) + e.qty }); }
  }
  const base = new Map(inv.lines.map((l) => [l.key, l.base]));
  const rows = [...minus.entries()].map(([key, v]) => ({ key, label: v.label, now: base.get(key) ?? 0, minus: v.qty, after: (base.get(key) ?? 0) - v.qty }))
    .sort((a, b) => a.after - b.after || a.label.localeCompare(b.label, "es"));
  return { orders: orders.length, unlinkedLines: unlinked, rows };
}

/** Aplica «Recalcular desde pedidos»: vincula las líneas de esos pedidos y descuenta (una vez; repetirlo no descuenta otra vez). */
export async function applyRecalc(businessId: string, mode: RecalcMode, from: string | null): Promise<{ orders: number; moves: number }> {
  const { supabase, workspaceId } = await getContext();
  const [ctx, orders] = await Promise.all([loadStockLinkContext(businessId), legacyOrders(businessId, mode, from)]);
  let done = 0, moves = 0;
  for (const o of orders) {
    const updates = o.order_items.map((i) => ({ id: i.id, effects: resolveLineStock(i, ctx) })).filter((u) => u.effects.length);
    if (!updates.length) continue;
    for (const u of updates) {
      const { error } = await supabase.from("order_items").update({ stock_effects: u.effects }).eq("id", u.id).eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
    }
    const { data, error } = await supabase.rpc("apply_order_stock", { p_order: o.id });
    if (error) throw new Error(error.message);
    done++; moves += data?.length ?? 0;
  }
  return { orders: done, moves };
}

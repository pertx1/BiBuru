"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { applyRecalc, moveStock, recalcPreview, syncStockTasks, type RecalcPreview } from "@/lib/stock/service";
import type { ActionResult } from "@/lib/schemas";

const refresh = () => { revalidatePath("/negocios", "layout"); revalidatePath("/tareas"); revalidatePath("/"); };
const key = z.string().min(3).max(200).regex(/^(tshirt|dtf|item)\|/);
const int = (max: number) => z.coerce.number().int().min(0).max(max);

const adjustSchema = z.object({
  businessId: z.uuid(), key, label: z.string().trim().min(1).max(200),
  mode: z.enum(["in", "out", "set"]), amount: int(1000000), reason: z.string().trim().max(200).optional(),
});

/** Entrada, salida o ajuste a una cantidad exacta (con motivo). Recalcula las tareas de reposición. */
export async function adjustStock(input: z.input<typeof adjustSchema>): Promise<ActionResult> {
  const p = adjustSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Revisa la cantidad" };
  const { businessId, mode, amount, reason, label } = p.data;
  if (mode !== "set" && amount === 0) return { ok: false, error: "La cantidad debe ser mayor que 0" };
  const change = mode === "set" ? { set: amount } : { delta: mode === "in" ? amount : -amount };
  const err = await moveStock(businessId, p.data.key, change, mode === "in" ? "entrada" : mode === "out" ? "salida" : "ajuste", reason || null, label);
  if (err) return { ok: false, error: err };
  await syncStockTasks(businessId);
  refresh();
  return { ok: true };
}

/** Stock mínimo de un artículo (0 = sin mínimo). */
export async function setStockMin(input: { businessId: string; key: string; min: number }): Promise<ActionResult> {
  const p = z.object({ businessId: z.uuid(), key, min: int(100000) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Mínimo no válido" };
  const { supabase, workspaceId } = await getContext();
  const [type, a, b] = p.data.key.split("|");
  const base = { workspace_id: workspaceId, business_id: p.data.businessId };
  const q = type === "tshirt" ? supabase.from("tshirt_stocks").update({ min_quantity: p.data.min }).match({ ...base, model: a, size: b })
    : type === "dtf" ? supabase.from("dtf_stocks").update({ min_quantity: p.data.min }).match({ ...base, name: a, variant: b })
    : supabase.from("stock_items").update({ min_quantity: p.data.min }).match({ ...base, id: a });
  const { error } = await q;
  if (error) return { ok: false, error: "No se pudo guardar el mínimo" };
  await syncStockTasks(p.data.businessId);
  refresh();
  return { ok: true };
}

const itemSchema = z.object({
  id: z.uuid().optional(), businessId: z.uuid(), name: z.string().trim().min(1, "Pon un nombre").max(80), variant: z.string().trim().max(60).default(""),
  productId: z.uuid().nullable().optional(), matchColor: z.string().trim().max(40).optional(), matchSize: z.string().trim().max(20).optional(),
  quantity: int(1000000).optional(), min: int(100000).default(0),
});

/** Alta o edición de un artículo genérico (materiales y productos). La cantidad inicial queda como movimiento «ajuste». */
export async function saveStockItem(input: z.input<typeof itemSchema>): Promise<ActionResult> {
  const p = itemSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos no válidos" };
  const { supabase, workspaceId, userId } = await getContext();
  const d = p.data;
  const row = { name: d.name, variant: d.variant, product_id: d.productId ?? null, match_color: d.matchColor || null, match_size: d.matchSize || null, min_quantity: d.min };
  if (d.id) {
    const { error } = await supabase.from("stock_items").update(row).eq("id", d.id).eq("workspace_id", workspaceId);
    if (error) return { ok: false, error: error.code === "23505" ? "Ya existe un artículo con ese nombre y variante" : "No se pudo guardar" };
  } else {
    const { data, error } = await supabase.from("stock_items").insert({ ...row, workspace_id: workspaceId, user_id: userId, business_id: d.businessId, quantity: 0 }).select("id").single();
    if (error) return { ok: false, error: error.code === "23505" ? "Ya existe un artículo con ese nombre y variante" : "No se pudo guardar" };
    if (d.quantity) await moveStock(d.businessId, `item|${data.id}`, { set: d.quantity }, "ajuste", "Stock inicial", d.variant ? `${d.name} ${d.variant}` : d.name);
  }
  await syncStockTasks(d.businessId);
  refresh();
  return { ok: true };
}

export async function deleteStockItem(id: string, businessId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(businessId).success) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("stock_items").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: "No se pudo borrar" };
  await syncStockTasks(businessId);
  refresh();
  return { ok: true };
}

/** Tras tachar una tarea «Pedir …»: apunta en Stock las unidades que han llegado (y la deja hecha). */
export async function receiveForTask(input: { taskId: string; units: number }): Promise<ActionResult> {
  const p = z.object({ taskId: z.uuid(), units: int(1000000) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Cantidad no válida" };
  const { supabase, workspaceId } = await getContext();
  const { data: t } = await supabase.from("tasks").select("id, business_id, stock_key, title").eq("id", p.data.taskId).eq("workspace_id", workspaceId).maybeSingle();
  if (!t?.stock_key || !t.business_id) return { ok: false, error: "No es una tarea de stock" };
  const label = t.title.replace(/^(Pedir|Reponer:) /, "").replace(/, faltan \d+$/, "");
  if (p.data.units > 0) {
    const err = await moveStock(t.business_id, t.stock_key, { delta: p.data.units }, "entrada", "Reposición (tarea completada)", label);
    if (err) return { ok: false, error: err };
  }
  const { error } = await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", t.id).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: "No se pudo completar la tarea" };
  await syncStockTasks(t.business_id);
  refresh();
  return { ok: true };
}

export type StockMove = { id: string; delta: number; kind: string; reason: string | null; moved_on: string; order_id: string | null; order_label: string | null; source: string };

/** Historial de movimientos de un artículo (los ligados a un pedido llevan a ese pedido). */
export async function stockHistory(businessId: string, itemKey: string): Promise<StockMove[]> {
  const p = z.object({ businessId: z.uuid(), key }).safeParse({ businessId, key: itemKey });
  if (!p.success) return [];
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase.from("stock_movements").select("id, delta, kind, reason, moved_on, order_id, order_label, source")
    .eq("workspace_id", workspaceId).eq("business_id", p.data.businessId).eq("item_key", p.data.key).order("created_at", { ascending: false }).limit(60);
  return data ?? [];
}

const recalcSchema = z.object({ businessId: z.uuid(), mode: z.enum(["pendientes", "desde"]), from: z.iso.date().nullish() });

/** «Recalcular desde pedidos» · vista previa (no cambia nada). */
export async function previewStockRecalc(input: z.input<typeof recalcSchema>): Promise<{ ok: true; preview: RecalcPreview } | { ok: false; error: string }> {
  const p = recalcSchema.safeParse(input);
  if (!p.success || (p.data.mode === "desde" && !p.data.from)) return { ok: false, error: "Elige desde qué fecha" };
  try { return { ok: true, preview: await recalcPreview(p.data.businessId, p.data.mode, p.data.from ?? null) }; }
  catch (e) { console.error("[stock] recalc preview", e instanceof Error ? e.message : e); return { ok: false, error: "No se pudo calcular" }; }
}

/** «Recalcular desde pedidos» · aplicar: esos pedidos pasan a descontar (una sola vez). */
export async function runStockRecalc(input: z.input<typeof recalcSchema>): Promise<ActionResult & { orders?: number }> {
  const p = recalcSchema.safeParse(input);
  if (!p.success || (p.data.mode === "desde" && !p.data.from)) return { ok: false, error: "Elige desde qué fecha" };
  try {
    const r = await applyRecalc(p.data.businessId, p.data.mode, p.data.from ?? null);
    await syncStockTasks(p.data.businessId);
    refresh();
    return { ok: true, orders: r.orders };
  } catch (e) { console.error("[stock] recalc", e instanceof Error ? e.message : e); return { ok: false, error: "No se pudo terminar. Vuelve a intentarlo: lo que ya se descontó no se descuenta otra vez." }; }
}

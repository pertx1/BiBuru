"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { loadStockLinkContext, syncStockTasks } from "@/lib/stock/service";
import { resolveLineStock } from "@/lib/stock/link";
import {
  businessSchema, categorySchema, expenseSchema, incomeSchema, orderSchema, productSchema,
  type ActionResult,
} from "@/lib/schemas";

function firstError(e: z.ZodError): ActionResult {
  return { ok: false, error: e.issues[0]?.message ?? "Datos no válidos" };
}
function dbError(op: string, e: { message: string; code?: string }): ActionResult {
  console.error(`[actions] ${op}:`, e.message);
  if (e.code === "23505") return { ok: false, error: "Ya existe un elemento con ese nombre." };
  return { ok: false, error: "No se pudo guardar. Inténtalo de nuevo." };
}
const str = (fd: FormData, k: string) => (fd.get(k) === null ? undefined : String(fd.get(k)));
const refresh = () => revalidatePath("/negocios", "layout");

// ------------------------------------------------------------------ negocios
export async function saveBusiness(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = businessSchema.safeParse({
    id: str(fd, "id") || undefined, name: str(fd, "name"), description: str(fd, "description"),
    color: str(fd, "color"), icon: str(fd, "icon"), production_enabled: fd.get("production_enabled") === "on",
  });
  if (!parsed.success) return firstError(parsed.error);
  const { supabase, workspaceId, userId } = await getContext();
  const { id, ...v } = parsed.data;
  const description = v.description ?? null;
  if (id) {
    const { error } = await supabase.from("businesses").update({ ...v, description }).eq("id", id).eq("workspace_id", workspaceId);
    if (error) return dbError("business.update", error);
    refresh();
    return { ok: true, id };
  }
  const { data, error } = await supabase
    .from("businesses").insert({ ...v, description, workspace_id: workspaceId, user_id: userId }).select("id").single();
  if (error) return dbError("business.insert", error);
  refresh();
  return { ok: true, id: data.id };
}

export async function setBusinessArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Negocio no válido" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("businesses").update({ archived }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return dbError("business.archive", error);
  refresh();
  return { ok: true };
}

// ------------------------------------------------------------------- pedidos
export type OrderPayload = z.input<typeof orderSchema>;

/** Crea o actualiza (con `id` existente) un pedido y sustituye sus líneas. */
export async function saveOrder(input: OrderPayload): Promise<ActionResult> {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return firstError(parsed.error);
  const { supabase, workspaceId, userId } = await getContext();
  const { items, id, ...o } = parsed.data;
  const row = {
    business_id: o.business_id, order_date: o.order_date, status: o.status,
    order_number: o.order_number ?? null, customer: o.customer ?? null, channel: o.channel ?? null, notes: o.notes ?? null,
  };

  let orderId = id;
  // Pedido anterior al descuento automático (ninguna línea vinculada): al editarlo sigue sin descontar, salvo las líneas
  // en las que elijas un artículo a mano. Así los pedidos antiguos no descuentan «hacia atrás» (para eso, «Recalcular desde pedidos»).
  let legacy = false;
  if (id) {
    const { data: existing } = await supabase.from("orders").select("id, order_items(stock_key, stock_effects)").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
    if (existing) {
      legacy = existing.order_items.length > 0 && existing.order_items.every((i) => i.stock_effects == null && i.stock_key == null);
      const { error } = await supabase.from("orders").update(row).eq("id", id).eq("workspace_id", workspaceId);
      if (error) return dbError("order.update", error);
      const { error: delErr } = await supabase.from("order_items").delete().eq("order_id", id).eq("workspace_id", workspaceId);
      if (delErr) return dbError("order.items.delete", delErr);
    } else {
      const { error } = await supabase.from("orders").insert({ ...row, id, workspace_id: workspaceId, user_id: userId });
      if (error) return dbError("order.restore", error);
    }
  } else {
    const { data, error } = await supabase
      .from("orders").insert({ ...row, workspace_id: workspaceId, user_id: userId }).select("id").single();
    if (error) return dbError("order.insert", error);
    orderId = data.id;
  }

  // Qué descuenta cada línea (artículo elegido o reconocido). Si falla la carga del catálogo, las líneas quedan sin vincular.
  const link = await loadStockLinkContext(o.business_id).catch(() => null);
  const { error: itemsErr } = await supabase.from("order_items").insert(
    items.map((i) => {
      const effects = link && (!legacy || i.stock_key) ? resolveLineStock(i, link) : [];
      return {
        workspace_id: workspaceId, user_id: userId, order_id: orderId!, product_id: i.product_id ?? null,
        product_name: i.product_name, color: i.color ?? null, size: i.size ?? null,
        quantity: i.quantity, unit_price_cents: i.unit_price, unit_cost_cents: i.unit_cost,
        stock_key: i.stock_key ?? null, stock_effects: effects.length ? effects : null,
      };
    }),
  );
  if (itemsErr) return dbError("order.items.insert", itemsErr);
  // Descuenta (o ajusta la diferencia si se ha editado) en una sola transacción en la base de datos.
  const { data: moved, error: stockErr } = await supabase.rpc("apply_order_stock", { p_order: orderId! });
  if (stockErr) console.error("[actions] order.stock:", stockErr.message);
  await syncStockTasks(o.business_id); // «Pedir …» si algo se queda a 0 o falta
  refresh();
  const short = (moved ?? []).filter((m) => m.delta < 0 && m.quantity < 0);
  const warning = short.length ? `Falta stock: ${short.map((m) => `${m.label} (${m.quantity})`).join(", ")}. Tienes la tarea «Pedir …» en Tareas.` : undefined;
  return { ok: true, id: orderId, warning };
}

export async function setOrderStatus(id: string, status: string): Promise<ActionResult> {
  const parsed = z.object({ id: z.uuid(), status: orderSchema.shape.status }).safeParse({ id, status });
  if (!parsed.success) return firstError(parsed.error);
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("orders").update({ status: parsed.data.status }).eq("id", parsed.data.id).eq("workspace_id", workspaceId).select("business_id").maybeSingle();
  if (error) return dbError("order.status", error);
  if (data) await syncStockTasks(data.business_id);
  refresh();
  return { ok: true };
}

export async function deleteOrder(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Pedido no válido" };
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("orders").delete().eq("id", id).eq("workspace_id", workspaceId).select("business_id").maybeSingle();
  if (error) return dbError("order.delete", error);
  if (data) await syncStockTasks(data.business_id);
  refresh();
  return { ok: true };
}

// -------------------------------------------------------------------- gastos
export type ExpensePayload = Record<string, string | undefined>;

export async function saveExpense(input: ExpensePayload): Promise<ActionResult> {
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return firstError(parsed.error);
  const { supabase, workspaceId, userId } = await getContext();
  const { id, amount, ...v } = parsed.data;
  const row = {
    business_id: v.business_id, expense_date: v.expense_date, concept: v.concept ?? null,
    category_id: v.category_id ?? null, amount_cents: amount, supplier: v.supplier ?? null,
    payment_method: v.payment_method ?? null, recurrence: v.recurrence ?? null,
    recurrence_end: v.recurrence ? (v.recurrence_end ?? null) : null, attachment_path: v.attachment_path ?? null,
  };
  if (id) {
    const { data: existing } = await supabase.from("expenses").select("id").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
    if (existing) {
      const { error } = await supabase.from("expenses").update(row).eq("id", id).eq("workspace_id", workspaceId);
      if (error) return dbError("expense.update", error);
      refresh();
      return { ok: true, id };
    }
  }
  const { data, error } = await supabase
    .from("expenses").insert({ ...row, id, workspace_id: workspaceId, user_id: userId }).select("id").single();
  if (error) return dbError("expense.insert", error);
  refresh();
  return { ok: true, id: data.id };
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Gasto no válido" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("expenses").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return dbError("expense.delete", error);
  refresh();
  return { ok: true };
}

/** Genera los gastos recurrentes que toquen hasta hoy (seguro de repetir). */
export async function materializeRecurring(): Promise<void> {
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.rpc("materialize_recurring_expenses", { ws: workspaceId });
  if (error) console.error("[actions] recurring:", error.message);
}

// ------------------------------------------------------------------ ingresos
export async function saveIncome(input: Record<string, string | undefined>): Promise<ActionResult> {
  const parsed = incomeSchema.safeParse(input);
  if (!parsed.success) return firstError(parsed.error);
  const { supabase, workspaceId, userId } = await getContext();
  const { id, amount, ...v } = parsed.data;
  const row = {
    business_id: v.business_id, income_date: v.income_date, source: v.source,
    concept: v.concept ?? null, amount_cents: amount, method: v.method ?? null,
  };
  if (id) {
    const { data: existing } = await supabase.from("incomes").select("id").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
    if (existing) {
      const { error } = await supabase.from("incomes").update(row).eq("id", id).eq("workspace_id", workspaceId);
      if (error) return dbError("income.update", error);
      refresh();
      return { ok: true, id };
    }
  }
  const { data, error } = await supabase
    .from("incomes").insert({ ...row, id, workspace_id: workspaceId, user_id: userId }).select("id").single();
  if (error) return dbError("income.insert", error);
  refresh();
  return { ok: true, id: data.id };
}

export async function deleteIncome(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Ingreso no válido" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("incomes").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return dbError("income.delete", error);
  refresh();
  return { ok: true };
}

// ----------------------------------------------------------------- productos
export async function saveProduct(input: Record<string, string | undefined>): Promise<ActionResult> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return firstError(parsed.error);
  const { supabase, workspaceId, userId } = await getContext();
  const { id, price, cost, ...v } = parsed.data;
  const row = { business_id: v.business_id, name: v.name, price_cents: price, cost_cents: cost };
  const { error } = id
    ? await supabase.from("products").update(row).eq("id", id).eq("workspace_id", workspaceId)
    : await supabase.from("products").insert({ ...row, workspace_id: workspaceId, user_id: userId });
  if (error) return dbError("product.save", error);
  refresh();
  return { ok: true };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Producto no válido" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("products").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return dbError("product.delete", error);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------- categorías
export async function saveCategory(input: Record<string, string | undefined>): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return firstError(parsed.error);
  const { supabase, workspaceId, userId } = await getContext();
  const { id, ...v } = parsed.data;
  const { error } = id
    ? await supabase.from("expense_categories").update(v).eq("id", id).eq("workspace_id", workspaceId)
    : await supabase.from("expense_categories").insert({ ...v, workspace_id: workspaceId, user_id: userId });
  if (error) return dbError("category.save", error);
  refresh();
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Categoría no válida" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("expense_categories").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return dbError("category.delete", error);
  refresh();
  return { ok: true };
}

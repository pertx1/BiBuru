"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createTask } from "@/lib/ai/actors";
import { getContext } from "@/lib/context";
import { nowLocal } from "@/lib/dates";
import { formatEUR, toCents } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/orders/payments";
import type { ActionResult } from "@/lib/schemas";

const refresh = () => { revalidatePath("/negocios", "layout"); revalidatePath("/"); };
const today = (tz: string) => nowLocal(new Date(), tz).date;

const paymentSchema = z.object({
  orderId: z.uuid(), paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: z.string().max(20),
  method: z.enum(PAYMENT_METHODS), note: z.string().trim().max(300).optional(),
});

/** Añade un cobro a un pedido (también lo marca como revisado). */
export async function addPayment(input: z.infer<typeof paymentSchema>): Promise<ActionResult> {
  const p = paymentSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Revisa la fecha y el importe" };
  const cents = toCents(p.data.amount);
  if (!cents || cents <= 0) return { ok: false, error: "El importe debe ser mayor que 0" };
  const { supabase, workspaceId, userId } = await getContext();
  const { error } = await supabase.from("order_payments").insert({ workspace_id: workspaceId, user_id: userId, order_id: p.data.orderId, paid_on: p.data.paidOn, amount_cents: cents, method: p.data.method, note: p.data.note || null });
  if (error) return { ok: false, error: "No se pudo guardar el cobro" };
  refresh();
  return { ok: true };
}

export async function deletePayment(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("order_payments").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: "No se pudo borrar el cobro" };
  refresh();
  return { ok: true };
}

/** «Marcar como pagado»: registra un cobro por lo que falte (hoy, método «otro» si no se dice). */
export async function markOrderPaid(orderId: string, method: (typeof PAYMENT_METHODS)[number] = "otro"): Promise<ActionResult> {
  if (!z.uuid().safeParse(orderId).success || !PAYMENT_METHODS.includes(method)) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId, userId, timezone } = await getContext();
  const { data: o } = await supabase.from("orders").select("id, total_cents, paid_cents, status").eq("id", orderId).eq("workspace_id", workspaceId).maybeSingle();
  if (!o) return { ok: false, error: "Pedido no encontrado" };
  if (o.status === "cancelado") return { ok: false, error: "El pedido está cancelado" };
  const left = o.total_cents - o.paid_cents;
  if (left > 0) {
    const { error } = await supabase.from("order_payments").insert({ workspace_id: workspaceId, user_id: userId, order_id: orderId, paid_on: today(timezone), amount_cents: left, method, note: "Marcado como pagado" });
    if (error) return { ok: false, error: "No se pudo marcar como pagado" };
  } else {
    await supabase.from("orders").update({ payment_reviewed: true }).eq("id", orderId).eq("workspace_id", workspaceId);
  }
  refresh();
  return { ok: true };
}

type SavedPayment = { paid_on: string; amount_cents: number; method: string; note: string | null };

/**
 * «No pagado»: borra los cobros del pedido (vuelve a «Pendiente») y los devuelve para poder deshacer.
 */
export async function markOrderUnpaid(orderId: string): Promise<ActionResult & { removed?: SavedPayment[] }> {
  if (!z.uuid().safeParse(orderId).success) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId } = await getContext();
  const { data: removed, error } = await supabase.from("order_payments").delete().eq("order_id", orderId).eq("workspace_id", workspaceId).select("paid_on, amount_cents, method, note");
  if (error) return { ok: false, error: "No se pudo marcar como no pagado" };
  await supabase.from("orders").update({ payment_reviewed: true }).eq("id", orderId).eq("workspace_id", workspaceId);
  refresh();
  return { ok: true, removed: removed ?? [] };
}

/** «Deshacer» de `markOrderUnpaid`: vuelve a poner los cobros borrados. */
export async function restorePayments(orderId: string, payments: SavedPayment[]): Promise<ActionResult> {
  const p = z.object({ orderId: z.uuid(), payments: z.array(z.object({ paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount_cents: z.number().int().positive().max(100_000_000), method: z.enum(PAYMENT_METHODS), note: z.string().max(300).nullable() })).max(200) }).safeParse({ orderId, payments });
  if (!p.success) return { ok: false, error: "Datos no válidos" };
  if (!p.data.payments.length) return { ok: true };
  const { supabase, workspaceId, userId } = await getContext();
  const { error } = await supabase.from("order_payments").insert(p.data.payments.map((x) => ({ ...x, workspace_id: workspaceId, user_id: userId, order_id: p.data.orderId })));
  if (error) return { ok: false, error: "No se pudo deshacer" };
  refresh();
  return { ok: true };
}

/**
 * Pedidos «sin revisar» (anteriores a los cobros) en bloque: o se dan por pagados (se registra un cobro por lo que faltara,
 * con la fecha del pedido y la nota «Regularización») o pasan a pendientes de cobro.
 */
export async function reviewOldOrders(businessId: string, mode: "paid" | "pending"): Promise<ActionResult & { count?: number }> {
  if (!z.uuid().safeParse(businessId).success || (mode !== "paid" && mode !== "pending")) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId, userId } = await getContext();
  const { data: rows, error } = await supabase.from("orders").select("id, order_date, total_cents, paid_cents, status").eq("workspace_id", workspaceId).eq("business_id", businessId).eq("payment_reviewed", false).limit(10000);
  if (error) return { ok: false, error: "No se pudieron leer los pedidos" };
  if (mode === "paid") {
    const pays = rows.filter((o) => o.status !== "cancelado" && o.total_cents > o.paid_cents)
      .map((o) => ({ workspace_id: workspaceId, user_id: userId, order_id: o.id, paid_on: o.order_date, amount_cents: o.total_cents - o.paid_cents, method: "otro", note: "Regularización: pedido anterior a los cobros" }));
    for (let i = 0; i < pays.length; i += 500) {
      const { error: e } = await supabase.from("order_payments").insert(pays.slice(i, i + 500));
      if (e) return { ok: false, error: "No se pudieron registrar todos los cobros. Vuelve a intentarlo: no se duplican." };
    }
  }
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 500) await supabase.from("orders").update({ payment_reviewed: true }).in("id", ids.slice(i, i + 500)).eq("workspace_id", workspaceId);
  refresh();
  return { ok: true, count: rows.length };
}

/** «Crear tarea para reclamar» una deuda (para hoy, en el negocio). */
export async function createDebtTask(input: { businessId: string; customer: string; dueCents: number; orders: number }): Promise<ActionResult & { href?: string }> {
  const p = z.object({ businessId: z.uuid(), customer: z.string().trim().min(1).max(120), dueCents: z.number().int().positive(), orders: z.number().int().positive() }).safeParse(input);
  if (!p.success) return { ok: false, error: "Datos no válidos" };
  const ctx = await getContext();
  try {
    const c = await createTask({ supabase: ctx.supabase, workspaceId: ctx.workspaceId, userId: ctx.userId, timezone: ctx.timezone },
      { title: `Reclamar ${formatEUR(p.data.dueCents)} a ${p.data.customer}`.slice(0, 200), business: p.data.businessId, date: today(ctx.timezone), notes: `${p.data.orders} ${p.data.orders === 1 ? "pedido pendiente" : "pedidos pendientes"} de cobro.` });
    refresh();
    return { ok: true, id: c.id, href: c.href };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "No se pudo crear la tarea" }; }
}

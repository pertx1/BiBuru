import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nowLocal, zonedToUtc } from "@/lib/dates";
import { formatDecimal, toCents } from "@/lib/money";
import { normalizeText } from "@/lib/production/text";
import { expenseSchema, orderSchema } from "@/lib/schemas";
import type { Database } from "@/lib/supabase/database.types";
import { eventSchema, goalSchema, taskSchema } from "@/lib/tasks/schemas";
import { noteSchema } from "@/lib/notes/schemas";
import { insertSimpleTask } from "@/lib/tasks/service";

type Db = SupabaseClient<Database>;
export type Actor = { supabase: Db; workspaceId: string; userId: string; timezone: string };
export type Created = { kind: "task" | "note" | "event" | "goal" | "reminder" | "expense" | "order" | "video"; id: string; label: string; href: string };
export class ActionError extends Error {}

/**
 * Acciones que la IA puede ejecutar (clasificación y chat). Reutilizan los mismos esquemas de validación que
 * los formularios, así que lo que la IA proponga nunca salta una regla. Funcionan con cualquier cliente
 * (sesión de usuario o clave de servicio en el cron), por eso reciben un `Actor` explícito.
 */

const fail = (msg: string): never => { throw new ActionError(msg); };
const first = (e: { issues: { message: string }[] }) => e.issues[0]?.message ?? "Datos no válidos";

export async function resolveBusiness(a: Actor, nameOrId?: string | null): Promise<{ id: string; name: string } | null> {
  if (!nameOrId) return null;
  const { data } = await a.supabase.from("businesses").select("id, name").eq("workspace_id", a.workspaceId).eq("archived", false);
  const list = data ?? [];
  const byId = list.find((b) => b.id === nameOrId);
  if (byId) return byId;
  const q = normalizeText(nameOrId).replace(/\s+/g, "");
  return list.find((b) => normalizeText(b.name).replace(/\s+/g, "") === q) ?? list.find((b) => normalizeText(b.name).replace(/\s+/g, "").includes(q) && q.length >= 3) ?? null;
}

async function resolveFolder(a: Actor, name?: string | null): Promise<string | null> {
  if (!name) return null;
  const { data } = await a.supabase.from("folders").select("id, name").eq("workspace_id", a.workspaceId);
  const q = normalizeText(name);
  return data?.find((f) => normalizeText(f.name) === q)?.id ?? null;
}

export async function addTagsTo(a: Actor, itemType: "note" | "task" | "video", itemId: string, tags: string[]): Promise<void> {
  const names = [...new Set(tags.map((t) => t.replace(/^#/, "").trim()).filter((t) => t.length > 0 && t.length <= 40))].slice(0, 8);
  if (names.length === 0) return;
  const { data: existing } = await a.supabase.from("tags").select("id, name").eq("workspace_id", a.workspaceId);
  const byName = new Map((existing ?? []).map((t) => [t.name.toLowerCase(), t.id]));
  for (const n of names) {
    let id = byName.get(n.toLowerCase());
    if (!id) {
      const ins = await a.supabase.from("tags").insert({ workspace_id: a.workspaceId, user_id: a.userId, name: n }).select("id").single();
      id = ins.data?.id;
      if (id) byName.set(n.toLowerCase(), id);
    }
    if (id) await a.supabase.from("taggings").upsert({ workspace_id: a.workspaceId, user_id: a.userId, tag_id: id, item_type: itemType, item_id: itemId }, { onConflict: "tag_id,item_type,item_id", ignoreDuplicates: true });
  }
}

export type TaskIn = { title: string; date?: string | null; time?: string | null; priority?: number; business?: string | null; notes?: string | null; tags?: string[]; folder?: string | null };
export async function createTask(a: Actor, i: TaskIn): Promise<Created> {
  const biz = await resolveBusiness(a, i.business);
  const p = taskSchema.safeParse({ title: i.title, notes: i.notes ?? "", due_date: i.date ?? "", due_time: i.date ? (i.time ?? "") : "", priority: i.priority ?? 0, business_id: biz?.id ?? null });
  if (!p.success) return fail(first(p.error));
  const r = await insertSimpleTask(a, {
    title: p.data.title, notes: p.data.notes ?? null, date: p.data.due_date ?? null, time: p.data.due_time ?? null,
    priority: p.data.priority, businessId: p.data.business_id ?? null, folderId: await resolveFolder(a, i.folder),
  });
  if ("error" in r) return fail("No se pudo crear la tarea");
  const data = r;
  if (i.tags?.length) await addTagsTo(a, "task", data.id, i.tags);
  return { kind: "task", id: data.id, label: p.data.title, href: `/tareas/${data.id}` };
}

export type NoteIn = { title: string; body?: string | null; business?: string | null; folder?: string | null; tags?: string[] };
export async function createNote(a: Actor, i: NoteIn): Promise<Created> {
  const biz = await resolveBusiness(a, i.business);
  const p = noteSchema.safeParse({ title: i.title, body: i.body ?? "", folder_id: null, business_id: biz?.id ?? null });
  if (!p.success) return fail(first(p.error));
  const { data, error } = await a.supabase.from("notes").insert({
    workspace_id: a.workspaceId, user_id: a.userId, title: p.data.title, body: p.data.body, business_id: p.data.business_id ?? null, folder_id: await resolveFolder(a, i.folder),
  }).select("id").single();
  if (error) return fail("No se pudo crear la nota");
  if (i.tags?.length) await addTagsTo(a, "note", data.id, i.tags);
  return { kind: "note", id: data.id, label: p.data.title || "Nota", href: `/notas/${data.id}` };
}

export type EventIn = { title: string; date: string; time?: string | null; end_time?: string | null; end_date?: string | null; all_day?: boolean; location?: string | null; business?: string | null; notes?: string | null };
export async function createEvent(a: Actor, i: EventIn): Promise<Created> {
  const biz = await resolveBusiness(a, i.business);
  const allDay = i.all_day ?? !i.time;
  const endTime = i.end_time ?? (i.time ? addHour(i.time) : "");
  const p = eventSchema.safeParse({
    title: i.title, notes: i.notes ?? "", location: i.location ?? "", all_day: allDay, start_date: i.date, start_time: allDay ? "" : i.time, end_date: i.end_date ?? i.date, end_time: allDay ? "" : endTime, business_id: biz?.id ?? null,
  });
  if (!p.success) return fail(first(p.error));
  const e = p.data;
  const { data, error } = await a.supabase.from("events").insert({
    workspace_id: a.workspaceId, user_id: a.userId, title: e.title, notes: e.notes ?? null, location: e.location ?? null, all_day: e.all_day, start_date: e.start_date,
    start_time: e.all_day ? null : (e.start_time ?? null), end_date: e.end_date, end_time: e.all_day ? null : (e.end_time ?? null), business_id: e.business_id ?? null,
  }).select("id").single();
  if (error) return fail("No se pudo crear el evento");
  return { kind: "event", id: data.id, label: e.title, href: `/calendario?v=semana&d=${e.start_date}` };
}
const addHour = (t: string) => { const h = Math.min(23, Number(t.slice(0, 2)) + 1); return t.slice(0, 2) === "23" ? "23:59" : `${String(h).padStart(2, "0")}:${t.slice(3, 5)}`; };

export type GoalIn = { title: string; measure?: "number" | "euros" | "percent" | "milestones"; target?: number | null; deadline?: string | null; business?: string | null; description?: string | null };
export async function createGoal(a: Actor, i: GoalIn): Promise<Created> {
  const biz = await resolveBusiness(a, i.business);
  const measure = i.measure ?? "milestones";
  const p = goalSchema.safeParse({ title: i.title, description: i.description ?? "", business_id: biz?.id ?? null, measure_type: measure, target: i.target != null ? String(i.target).replace(".", ",") : "", deadline: i.deadline ?? "" });
  if (!p.success) return fail(first(p.error));
  const target = measure === "milestones" ? 0 : (toCents(p.data.target ?? "") ?? 0);
  if (measure !== "milestones" && target <= 0) return fail("Indica el valor objetivo del objetivo");
  const { data, error } = await a.supabase.from("goals").insert({
    workspace_id: a.workspaceId, user_id: a.userId, title: p.data.title, description: p.data.description ?? null, business_id: p.data.business_id ?? null, measure_type: measure, target_value: target, deadline: p.data.deadline ?? null,
  }).select("id").single();
  if (error) return fail("No se pudo crear el objetivo");
  return { kind: "goal", id: data.id, label: p.data.title, href: `/objetivos/${data.id}` };
}

export async function createReminderAt(a: Actor, i: { title: string; date: string; time?: string | null }): Promise<Created> {
  const at = zonedToUtc(i.date, i.time ?? "09:00", a.timezone);
  if (at.getTime() < Date.now() - 60_000) return fail("Esa fecha y hora ya pasaron");
  if (!i.title.trim()) return fail("Falta el texto del recordatorio");
  const { data, error } = await a.supabase.from("reminders").insert({ workspace_id: a.workspaceId, user_id: a.userId, title: i.title.trim().slice(0, 200), remind_at: at.toISOString() }).select("id").single();
  if (error) return fail("No se pudo crear el recordatorio");
  const l = nowLocal(at, a.timezone);
  return { kind: "reminder", id: data.id, label: `${i.title.trim()} (${l.date} ${l.time})`, href: `/aviso/reminder/${data.id}` };
}

// ------------------------------------------------------------- dinero: solo con confirmación
export type ExpenseIn = { business: string; amount_eur: number; concept?: string | null; category?: string | null; supplier?: string | null; payment_method?: string | null; date?: string | null };
export type ExpenseResolved = { business: { id: string; name: string }; amount_cents: number; concept: string | null; category: { id: string; name: string } | null; supplier: string | null; payment_method: string | null; date: string };

/** Valida y resuelve nombres (negocio, categoría) para mostrar la tarjeta de confirmación. No escribe nada. */
export async function resolveExpense(a: Actor, i: ExpenseIn): Promise<ExpenseResolved> {
  const biz = await resolveBusiness(a, i.business);
  if (!biz) return fail(`No encuentro el negocio «${i.business}». Dime a cuál te refieres.`);
  const cents = toCents(i.amount_eur);
  if (cents === null || cents <= 0) return fail("El importe no es válido");
  let category: ExpenseResolved["category"] = null;
  if (i.category) {
    const { data } = await a.supabase.from("expense_categories").select("id, name").eq("workspace_id", a.workspaceId);
    const q = normalizeText(i.category);
    category = data?.find((c) => normalizeText(c.name) === q) ?? data?.find((c) => normalizeText(c.name).includes(q) || q.includes(normalizeText(c.name))) ?? null;
  }
  const date = i.date ?? nowLocal(new Date(), a.timezone).date;
  const p = expenseSchema.safeParse({ business_id: biz.id, expense_date: date, amount: formatDecimal(cents), concept: i.concept ?? "", category_id: category?.id ?? "", supplier: i.supplier ?? "", payment_method: i.payment_method ?? "" });
  if (!p.success) return fail(first(p.error));
  return { business: biz, amount_cents: cents, concept: p.data.concept ?? null, category, supplier: p.data.supplier ?? null, payment_method: p.data.payment_method ?? null, date };
}

export async function createExpense(a: Actor, r: ExpenseResolved): Promise<Created> {
  const { data, error } = await a.supabase.from("expenses").insert({
    workspace_id: a.workspaceId, user_id: a.userId, business_id: r.business.id, expense_date: r.date, concept: r.concept, category_id: r.category?.id ?? null,
    amount_cents: r.amount_cents, supplier: r.supplier, payment_method: r.payment_method,
  }).select("id").single();
  if (error) return fail("No se pudo guardar el gasto");
  return { kind: "expense", id: data.id, label: `${r.concept ?? "Gasto"} · ${formatDecimal(r.amount_cents)} €`, href: `/negocios/${r.business.id}/gastos?abrir=${data.id}` };
}

export type OrderIn = { business: string; customer?: string | null; channel?: string | null; date?: string | null; status?: string | null; notes?: string | null; items: { product: string; color?: string | null; size?: string | null; quantity?: number; unit_price_eur?: number | null }[] };
export type OrderResolved = { business: { id: string; name: string }; customer: string | null; channel: string | null; date: string; status: string; notes: string | null; items: { product_name: string; color: string | null; size: string | null; quantity: number; unit_price_cents: number; unit_cost_cents: number }[]; total_cents: number };

export async function resolveOrder(a: Actor, i: OrderIn): Promise<OrderResolved> {
  const biz = await resolveBusiness(a, i.business);
  if (!biz) return fail(`No encuentro el negocio «${i.business}». Dime a cuál te refieres.`);
  const date = i.date ?? nowLocal(new Date(), a.timezone).date;
  const p = orderSchema.safeParse({
    business_id: biz.id, order_date: date, customer: i.customer ?? "", channel: i.channel ?? "", status: i.status ?? "sin_hacer", notes: i.notes ?? "",
    items: i.items.map((it) => ({ product_name: it.product, color: it.color ?? "", size: it.size ?? "", quantity: it.quantity ?? 1, unit_price: it.unit_price_eur != null ? formatDecimal(Math.round(it.unit_price_eur * 100)) : "", unit_cost: "" })),
  });
  if (!p.success) return fail(first(p.error));
  // Completa precio y coste desde el catálogo si la persona no los dijo.
  const { data: products } = await a.supabase.from("products").select("name, price_cents, cost_cents").eq("workspace_id", a.workspaceId).eq("business_id", biz.id);
  const items = p.data.items.map((it) => {
    const cat = products?.find((x) => normalizeText(x.name) === normalizeText(it.product_name));
    return { product_name: it.product_name, color: it.color ?? null, size: it.size ?? null, quantity: it.quantity, unit_price_cents: it.unit_price || cat?.price_cents || 0, unit_cost_cents: it.unit_cost || cat?.cost_cents || 0 };
  });
  return { business: biz, customer: p.data.customer ?? null, channel: p.data.channel ?? null, date, status: p.data.status, notes: p.data.notes ?? null, items, total_cents: items.reduce((s, x) => s + x.quantity * x.unit_price_cents, 0) };
}

export async function createOrder(a: Actor, r: OrderResolved): Promise<Created> {
  const { data, error } = await a.supabase.from("orders").insert({
    workspace_id: a.workspaceId, user_id: a.userId, business_id: r.business.id, order_date: r.date, customer: r.customer, channel: r.channel, status: r.status, notes: r.notes,
  }).select("id").single();
  if (error) return fail("No se pudo guardar el pedido");
  const { error: e2 } = await a.supabase.from("order_items").insert(r.items.map((it) => ({ workspace_id: a.workspaceId, user_id: a.userId, order_id: data.id, ...it })));
  if (e2) { await a.supabase.from("orders").delete().eq("id", data.id); return fail("No se pudieron guardar las líneas del pedido"); }
  return { kind: "order", id: data.id, label: `Pedido ${r.customer ?? ""} · ${formatDecimal(r.total_cents)} €`.trim(), href: `/negocios/${r.business.id}/pedidos?abrir=${data.id}` };
}

import "server-only";
import { addDays, endOfMonth, isValidISO, nowLocal, startOfMonth } from "@/lib/dates";
import { formatDecimal } from "@/lib/money";
import { normalizeText } from "@/lib/production/text";
import { ORDER_STATUSES, expenseSchema } from "@/lib/schemas";
import { expandEvents } from "@/lib/tasks/calendar";
import { createEvent, createNote, createReminderAt, createTask, resolveBusiness, resolveExpense, resolveOrder, type Actor, type Created, type ExpenseIn, type OrderIn } from "./actors";
import type { FunctionDecl } from "./provider";

/** Acción pendiente de confirmar (gastos y pedidos): la IA nunca los escribe directamente. */
export type PendingAction =
  | { type: "create_expense"; input: ExpenseIn; summary: string }
  | { type: "create_order"; input: OrderIn; summary: string }
  | { type: "change_expense"; id: string; changes: { amount_eur?: number; concept?: string; category?: string; date?: string }; summary: string }
  | { type: "change_order"; id: string; changes: { status?: string; customer?: string }; summary: string };

export type ToolOutcome = { result: Record<string, unknown>; created?: Created; pending?: PendingAction };
type Ctx = { actor: Actor };

const str = { type: "string" };
const date = { type: "string", description: "Fecha AAAA-MM-DD" };
const time = { type: "string", description: "Hora HH:MM (24 h)" };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });

export const TOOL_DECLARATIONS: FunctionDecl[] = [
  { name: "list_businesses", description: "Lista los negocios del usuario (id y nombre).", parametersJsonSchema: obj({}) },
  { name: "search", description: "Busca en notas, tareas, pedidos y gastos por texto.", parametersJsonSchema: obj({ query: str }, ["query"]) },
  { name: "list_tasks", description: "Lista tareas. Sin fechas devuelve las abiertas. Para «hoy» o «mañana» usa from=to=esa fecha.", parametersJsonSchema: obj({ from: date, to: date, status: { type: "string", enum: ["open", "done"] }, business: str }) },
  { name: "list_events", description: "Lista eventos del calendario entre dos fechas (incluye recurrentes).", parametersJsonSchema: obj({ from: date, to: date }, ["from", "to"]) },
  { name: "business_summary", description: "Ingresos, gastos y beneficio de un periodo. Sin `business` devuelve todos los negocios, uno por uno. Incluye lo más vendido si es de un negocio.", parametersJsonSchema: obj({ business: str, from: date, to: date }, ["from", "to"]) },
  { name: "create_task", description: "Crea una tarea.", parametersJsonSchema: obj({ title: str, date, time, priority: { type: "integer", description: "0 a 3" }, business: str, notes: str }, ["title"]) },
  { name: "update_task", description: "Cambia una tarea existente (usa su id de list_tasks/search). Para completarla pon done=true.", parametersJsonSchema: obj({ id: str, title: str, date, time, priority: { type: "integer" }, done: { type: "boolean" } }, ["id"]) },
  { name: "create_note", description: "Crea una nota o guarda una idea (title y body).", parametersJsonSchema: obj({ title: str, body: str, business: str }, ["title"]) },
  { name: "append_to_note", description: "Añade texto al final de una nota existente (id de search).", parametersJsonSchema: obj({ id: str, text: str }, ["id", "text"]) },
  { name: "create_event", description: "Crea un evento en el calendario. Sin time es de todo el día.", parametersJsonSchema: obj({ title: str, date, time, end_time: time, location: str, business: str }, ["title", "date"]) },
  { name: "update_event", description: "Cambia un evento (id de list_events).", parametersJsonSchema: obj({ id: str, title: str, date, time, end_time: time }, ["id"]) },
  { name: "create_reminder", description: "Crea un recordatorio que avisará por notificación.", parametersJsonSchema: obj({ title: str, date, time }, ["title", "date"]) },
  { name: "propose_expense", description: "Propone apuntar un gasto. NO lo guarda: se mostrará una tarjeta de confirmación al usuario.", parametersJsonSchema: obj({ business: str, amount_eur: { type: "number" }, concept: str, category: str, supplier: str, date }, ["business", "amount_eur"]) },
  { name: "propose_order", description: "Propone crear un pedido. NO lo guarda: requiere confirmación del usuario.", parametersJsonSchema: obj({ business: str, customer: str, channel: str, date, items: { type: "array", items: obj({ product: str, color: str, size: str, quantity: { type: "integer" }, unit_price_eur: { type: "number" } }, ["product"]) } }, ["business", "items"]) },
  { name: "propose_change_expense", description: "Propone cambiar un gasto existente (id de search). Requiere confirmación.", parametersJsonSchema: obj({ id: str, amount_eur: { type: "number" }, concept: str, category: str, date }, ["id"]) },
  { name: "propose_change_order", description: "Propone cambiar el estado o cliente de un pedido (id de search). Requiere confirmación.", parametersJsonSchema: obj({ id: str, status: { type: "string", enum: [...ORDER_STATUSES] }, customer: str }, ["id"]) },
];

const iso = (v: unknown): string | null => (typeof v === "string" && isValidISO(v) ? v : null);
const text = (v: unknown, max = 500): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const eur = (cents: number) => `${formatDecimal(cents)} €`;

/** Ejecuta una herramienta con la sesión del usuario (RLS). Los datos devueltos al modelo son pocos y compactos. */
export async function executeTool(ctx: Ctx, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  const a = ctx.actor;
  const { supabase, workspaceId } = a;
  const today = nowLocal(new Date(), a.timezone).date;

  switch (name) {
    case "list_businesses": {
      const { data } = await supabase.from("businesses").select("id, name, description").eq("workspace_id", workspaceId).eq("archived", false);
      return { result: { businesses: data ?? [] } };
    }
    case "search": {
      const q = text(args.query, 100);
      if (!q) return { result: { error: "Falta la búsqueda" } };
      const { data } = await supabase.rpc("search_all", { ws: workspaceId, q, max_rows: 15 });
      return { result: { results: (data ?? []).map((r) => ({ kind: r.kind, id: r.id, title: r.title, snippet: r.snippet.replace(/<\/?b>/g, "").slice(0, 120), date: r.happened_on, business_id: r.business_id })) } };
    }
    case "list_tasks": {
      const biz = await resolveBusiness(a, text(args.business));
      const status = args.status === "done" ? "done" : "open";
      let q = supabase.from("tasks").select("id, title, due_date, due_time, priority, business_id, status").eq("workspace_id", workspaceId).eq("status", status).is("parent_id", null).order("due_date", { nullsFirst: false }).limit(40);
      const from = iso(args.from), to = iso(args.to);
      if (from) q = q.gte("due_date", from);
      if (to) q = q.lte("due_date", to);
      if (biz) q = q.eq("business_id", biz.id);
      const { data } = await q;
      return { result: { today, tasks: (data ?? []).map((t) => ({ id: t.id, title: t.title, due: t.due_date ? `${t.due_date}${t.due_time ? ` ${t.due_time.slice(0, 5)}` : ""}` : null, priority: t.priority, overdue: !!t.due_date && t.due_date < today && t.status === "open" })) } };
    }
    case "list_events": {
      const from = iso(args.from) ?? today, to = iso(args.to) ?? addDays(from, 7);
      const { data } = await supabase.from("events").select("*").eq("workspace_id", workspaceId).lte("start_date", to).or(`end_date.gte.${from},recurrence.not.is.null`).limit(200);
      const items = expandEvents(data ?? [], from, to).sort((x, y) => x.date.localeCompare(y.date) || (x.startTime ?? "").localeCompare(y.startTime ?? "")).slice(0, 40);
      return { result: { events: items.map((e) => ({ id: e.id, title: e.title, date: e.date, start: e.startTime, location: e.location })) } };
    }
    case "business_summary": {
      const from = iso(args.from) ?? startOfMonth(today), to = iso(args.to) ?? endOfMonth(today);
      const biz = await resolveBusiness(a, text(args.business));
      if (text(args.business) && !biz) return { result: { error: `No encuentro el negocio «${text(args.business)}»` } };
      const { data: totals } = await supabase.rpc("stats_totals", { ws: workspaceId, p_from: from, p_to: to, p_business: biz?.id });
      const { data: bs } = await supabase.from("businesses").select("id, name").eq("workspace_id", workspaceId);
      const name = new Map((bs ?? []).map((b) => [b.id, b.name]));
      const rows = (totals ?? []).map((t) => ({ business: name.get(t.business_id) ?? "?", income: eur(t.income_cents), expenses: eur(t.expense_cents), profit: eur(t.income_cents - t.expense_cents), orders: t.orders_count }));
      const extra: Record<string, unknown> = {};
      if (biz) {
        const [top, cats] = await Promise.all([
          supabase.rpc("stats_top_products", { ws: workspaceId, p_from: from, p_to: to, p_business: biz.id, group_by: "product", max_rows: 5 }),
          supabase.rpc("stats_expenses_by_category", { ws: workspaceId, p_from: from, p_to: to, p_business: biz.id, max_rows: 5 }),
        ]);
        extra.top_products = (top.data ?? []).map((r) => `${r.label}: ${r.units} uds`);
        extra.expenses_by_category = (cats.data ?? []).map((r) => `${r.label}: ${eur(r.amount_cents)}`);
      }
      return { result: { period: `${from} a ${to}`, note: "beneficio = ingresos (pedidos no cancelados + ingresos sueltos) − gastos", summary: rows, ...extra } };
    }
    case "create_task": {
      const c = await createTask(a, { title: text(args.title, 200) ?? "", date: iso(args.date), time: text(args.time, 5), priority: num(args.priority) ?? 0, business: text(args.business), notes: text(args.notes, 2000) });
      return { result: { created: c.label, id: c.id }, created: c };
    }
    case "update_task": {
      const id = text(args.id, 40);
      if (!id) return { result: { error: "Falta el id" } };
      const patch: Record<string, unknown> = {};
      if (text(args.title, 200)) patch.title = text(args.title, 200);
      if (iso(args.date)) patch.due_date = iso(args.date);
      if (text(args.time, 5) && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(args.time))) patch.due_time = args.time;
      if (num(args.priority) !== null) patch.priority = Math.max(0, Math.min(3, Math.trunc(num(args.priority)!)));
      if (typeof args.done === "boolean") { patch.status = args.done ? "done" : "open"; patch.completed_at = args.done ? new Date().toISOString() : null; }
      if (Object.keys(patch).length === 0) return { result: { error: "Nada que cambiar" } };
      const { data, error } = await supabase.from("tasks").update(patch as never).eq("id", id).eq("workspace_id", workspaceId).select("id, title").maybeSingle();
      if (error || !data) return { result: { error: "No encontré esa tarea" } };
      return { result: { updated: data.title }, created: { kind: "task", id: data.id, label: data.title, href: `/tareas?v=todas&abrir=${data.id}` } };
    }
    case "create_note": {
      const c = await createNote(a, { title: text(args.title, 200) ?? "", body: text(args.body, 20000), business: text(args.business) });
      return { result: { created: c.label, id: c.id }, created: c };
    }
    case "append_to_note": {
      const id = text(args.id, 40), t = text(args.text, 5000);
      if (!id || !t) return { result: { error: "Faltan datos" } };
      const { data: n } = await supabase.from("notes").select("id, title, body").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
      if (!n) return { result: { error: "No encontré esa nota" } };
      await supabase.from("notes").update({ body: `${n.body}${n.body ? "\n\n" : ""}${t}`.slice(0, 200000) }).eq("id", id).eq("workspace_id", workspaceId);
      return { result: { updated: n.title }, created: { kind: "note", id: n.id, label: n.title || "Nota", href: `/notas/${n.id}` } };
    }
    case "create_event": {
      const d = iso(args.date);
      if (!d) return { result: { error: "Falta la fecha (AAAA-MM-DD)" } };
      const c = await createEvent(a, { title: text(args.title, 200) ?? "", date: d, time: text(args.time, 5), end_time: text(args.end_time, 5), location: text(args.location, 200), business: text(args.business) });
      return { result: { created: c.label, id: c.id }, created: c };
    }
    case "update_event": {
      const id = text(args.id, 40);
      if (!id) return { result: { error: "Falta el id" } };
      const { data: e } = await supabase.from("events").select("*").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
      if (!e) return { result: { error: "No encontré ese evento" } };
      const patch: Record<string, unknown> = {};
      if (text(args.title, 200)) patch.title = text(args.title, 200);
      const nd = iso(args.date);
      if (nd) { const span = Math.round((Date.parse(e.end_date) - Date.parse(e.start_date)) / 86_400_000); patch.start_date = nd; patch.end_date = addDays(nd, span); }
      if (text(args.time, 5) && !e.all_day) patch.start_time = args.time;
      if (text(args.end_time, 5) && !e.all_day) patch.end_time = args.end_time;
      const { error } = await supabase.from("events").update(patch as never).eq("id", id).eq("workspace_id", workspaceId);
      if (error) return { result: { error: "No se pudo cambiar (¿la hora de fin es anterior al inicio?)" } };
      return { result: { updated: e.title }, created: { kind: "event", id, label: String(patch.title ?? e.title), href: `/calendario?v=semana&d=${patch.start_date ?? e.start_date}` } };
    }
    case "create_reminder": {
      const d = iso(args.date);
      if (!d) return { result: { error: "Falta la fecha (AAAA-MM-DD)" } };
      const c = await createReminderAt(a, { title: text(args.title, 200) ?? "", date: d, time: text(args.time, 5) });
      return { result: { created: c.label, id: c.id }, created: c };
    }
    case "propose_expense": {
      const input: ExpenseIn = { business: text(args.business, 60) ?? "", amount_eur: num(args.amount_eur) ?? NaN, concept: text(args.concept, 120), category: text(args.category, 60), supplier: text(args.supplier, 120), date: iso(args.date) };
      const r = await resolveExpense(a, input); // valida y resuelve; lanza ActionError si algo no cuadra
      return { result: { status: "awaiting_user_confirmation", note: "Se ha mostrado una tarjeta de confirmación. NO digas que está guardado." }, pending: { type: "create_expense", input, summary: `${eur(r.amount_cents)} · ${r.concept ?? "Gasto"} · ${r.business.name}${r.category ? ` · ${r.category.name}` : ""} · ${r.date}` } };
    }
    case "propose_order": {
      const items = Array.isArray(args.items) ? (args.items as Record<string, unknown>[]).slice(0, 20).map((i) => ({ product: text(i.product, 80) ?? "", color: text(i.color, 40), size: text(i.size, 20), quantity: Math.max(1, Math.trunc(num(i.quantity) ?? 1)), unit_price_eur: num(i.unit_price_eur) })) : [];
      const input: OrderIn = { business: text(args.business, 60) ?? "", customer: text(args.customer, 120), channel: text(args.channel, 60), date: iso(args.date), items };
      const r = await resolveOrder(a, input);
      return { result: { status: "awaiting_user_confirmation", note: "Se ha mostrado una tarjeta de confirmación. NO digas que está guardado." }, pending: { type: "create_order", input, summary: `${r.items.map((i) => `${i.quantity}× ${i.product_name}`).join(", ")} · ${eur(r.total_cents)} · ${r.business.name}${r.customer ? ` · ${r.customer}` : ""}` } };
    }
    case "propose_change_expense": {
      const id = text(args.id, 40);
      const { data: e } = id ? await supabase.from("expenses").select("id, concept, amount_cents").eq("id", id).eq("workspace_id", workspaceId).maybeSingle() : { data: null };
      if (!e) return { result: { error: "No encontré ese gasto" } };
      const changes = { amount_eur: num(args.amount_eur) ?? undefined, concept: text(args.concept, 120) ?? undefined, category: text(args.category, 60) ?? undefined, date: iso(args.date) ?? undefined };
      if (Object.values(changes).every((v) => v === undefined)) return { result: { error: "Nada que cambiar" } };
      return { result: { status: "awaiting_user_confirmation", note: "Tarjeta de confirmación mostrada. NO digas que ya se cambió." }, pending: { type: "change_expense", id: e.id, changes, summary: `Gasto «${e.concept ?? eur(e.amount_cents)}»: ${Object.entries(changes).filter(([, v]) => v !== undefined).map(([k, v]) => `${k} → ${v}`).join(", ")}` } };
    }
    case "propose_change_order": {
      const id = text(args.id, 40);
      const { data: o } = id ? await supabase.from("orders").select("id, customer, status").eq("id", id).eq("workspace_id", workspaceId).maybeSingle() : { data: null };
      if (!o) return { result: { error: "No encontré ese pedido" } };
      const status = (ORDER_STATUSES as readonly string[]).includes(String(args.status)) ? String(args.status) : undefined;
      const changes = { status, customer: text(args.customer, 120) ?? undefined };
      if (!changes.status && !changes.customer) return { result: { error: "Nada que cambiar" } };
      return { result: { status: "awaiting_user_confirmation", note: "Tarjeta de confirmación mostrada. NO digas que ya se cambió." }, pending: { type: "change_order", id: o.id, changes, summary: `Pedido de ${o.customer ?? "sin cliente"}: ${Object.entries(changes).filter(([, v]) => v).map(([k, v]) => `${k} → ${v}`).join(", ")}` } };
    }
    default:
      return { result: { error: `Herramienta desconocida: ${name}` } };
  }
}

/** Valida una acción pendiente tal y como la guardó el servidor (nunca se confía en lo que envíe el cliente). */
export function isPendingAction(v: unknown): v is PendingAction {
  return !!v && typeof v === "object" && ["create_expense", "create_order", "change_expense", "change_order"].includes((v as { type?: string }).type ?? "");
}

export { normalizeText, expenseSchema };

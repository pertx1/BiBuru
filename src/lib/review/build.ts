import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eventOccurrences } from "@/lib/notifications/planning";
import type { Database } from "@/lib/supabase/database.types";
import type { ReviewKind, ReviewPeriod } from "./period";

/**
 * Cifras de una revisión, calculadas con datos reales (sin IA). Sirve con la sesión de la persona (pantalla Revisión) y con
 * la clave de servicio (cron): toda consulta filtra por espacio y, el correo, por persona. Las funciones `stats_*` son las mismas
 * que Estadísticas e Inicio.
 */
export type Db = { supabase: SupabaseClient<Database>; workspaceId: string; userId: string };
export type Totals = { income: number; expense: number; profit: number; orders: number };
export type OrderRef = { id: string; businessId: string; label: string; totalCents: number; dueCents?: number; status?: string };
export type TaskRef = { id: string; title: string; dueDate: string | null; priority: number; businessId: string | null; createdAt?: string };
export type GoalRef = { id: string; title: string; pct: number };
export type ReviewData = {
  v: 1; kind: ReviewKind; start: string; end: string; business: string | null; generatedAt: string;
  money: { cur: Totals; prev: Totals; curLabel: string; prevLabel: string };
  monthToDate: Totals | null;                      // diaria: lo que llevas de mes
  orders: { count: number; latest: OrderRef[]; topProducts: { label: string; units: number; revenue: number }[] };
  receivable: { totalCents: number; count: number; list: OrderRef[] };
  expensesByCategory: { label: string; amount: number; color: string | null }[];
  tasks: { today: TaskRef[]; overdue: TaskRef[]; noDate: TaskRef[]; noDateTotal: number; done: number; open: number; oldest: TaskRef[] };
  events: { id: string; title: string; date: string; time: string | null }[];
  inbox: { mail: number; social: number; items: { key: string; channel: "correo" | "instagram" | "tiktok"; person: string; preview: string; href: string }[] };
  stock: { title: string; businessId: string | null; taskId: string }[];
  social: { gained: number; accounts: { username: string; platform: string; now: number | null; gained: number | null }[]; best: { caption: string; permalink: string | null; interactions: number } | null } | null;
  goals: GoalRef[] | null;
  priorities: string[];
};

const ZERO: Totals = { income: 0, expense: 0, profit: 0, orders: 0 };

async function totals(db: Db, from: string, to: string, business: string | null): Promise<Totals> {
  const { data, error } = await db.supabase.rpc("stats_totals", { ws: db.workspaceId, p_from: from, p_to: to, p_business: business ?? undefined });
  if (error) throw new Error(`revisión: totales: ${error.message}`);
  const t = (data ?? []).reduce((s, r) => ({ income: s.income + Number(r.income_cents), expense: s.expense + Number(r.expense_cents), orders: s.orders + Number(r.orders_count) }), { income: 0, expense: 0, orders: 0 });
  return { ...t, profit: t.income - t.expense };
}

const orderLabel = (o: { customer: string | null; order_number: string | null }) => o.customer ?? (o.order_number ? `Pedido ${o.order_number}` : "Sin cliente");

export async function buildReviewData(db: Db, p: ReviewPeriod, today: string, business: string | null, extras: { goals?: () => Promise<GoalRef[]> } = {}): Promise<ReviewData> {
  const { supabase, workspaceId, userId } = db;
  const k = p.kind;
  const biz = <Q extends { eq: (c: string, v: string) => Q }>(q: Q, col = "business_id") => (business ? q.eq(col, business) : q);
  const monthStart = `${today.slice(0, 8)}01`;

  // --------------------------------------------------------------- dinero
  const [cur, prev, mtd] = await Promise.all([
    k === "diaria" ? totals(db, p.previous.from, p.previous.to, business) : totals(db, p.start, p.end, business),
    k === "diaria" ? Promise.resolve(ZERO) : totals(db, p.previous.from, p.previous.to, business),
    k === "diaria" ? totals(db, monthStart, today, business) : Promise.resolve(null),
  ]);
  const money = k === "diaria"
    ? { cur, prev: ZERO, curLabel: "Ayer", prevLabel: "" }
    : { cur, prev, curLabel: k === "semanal" ? "Esta semana" : "Este mes", prevLabel: k === "semanal" ? "semana anterior" : "mes anterior" };

  // --------------------------------------------------------------- pedidos y cobros
  const newFrom = k === "diaria" ? p.previous.from : p.start, newTo = k === "diaria" ? today : p.end;
  const [latest, due, top, cats] = await Promise.all([
    biz(supabase.from("orders").select("id, business_id, customer, order_number, total_cents, status", { count: "exact" }).eq("workspace_id", workspaceId)
      .neq("status", "cancelado").gte("order_date", newFrom).lte("order_date", newTo)).order("order_date", { ascending: false }).order("created_at", { ascending: false }).limit(8),
    biz(supabase.from("orders").select("id, business_id, customer, order_number, total_cents, due_cents, order_date").eq("workspace_id", workspaceId).gt("due_cents", 0))
      .order("order_date").limit(200),
    k === "diaria" ? Promise.resolve({ data: [] }) : supabase.rpc("stats_top_products", { ws: workspaceId, p_from: p.start, p_to: p.end, p_business: business ?? undefined, group_by: "product", max_rows: 5 }),
    k === "mensual" ? supabase.rpc("stats_expenses_by_category", { ws: workspaceId, p_from: p.start, p_to: p.end, p_business: business ?? undefined, max_rows: 8 }) : Promise.resolve({ data: [] }),
  ]);
  const dueRows = due.data ?? [];

  // --------------------------------------------------------------- tareas
  const taskCols = "id, title, due_date, priority, business_id, created_at";
  const toRef = (t: { id: string; title: string; due_date: string | null; priority: number; business_id: string | null; created_at?: string }): TaskRef =>
    ({ id: t.id, title: t.title, dueDate: t.due_date, priority: t.priority, businessId: t.business_id, createdAt: t.created_at });
  const open = () => biz(supabase.from("tasks").select(taskCols, { count: "exact" }).eq("workspace_id", workspaceId).eq("status", "open"));
  const [tToday, tOver, tNoDate, tDone, tOpen, tOldest] = await Promise.all([
    k === "diaria" ? open().eq("due_date", today).order("priority", { ascending: false }).limit(20) : Promise.resolve({ data: [], count: 0 }),
    k === "diaria" ? open().lt("due_date", today).order("due_date").limit(20) : Promise.resolve({ data: [], count: 0 }),
    k === "diaria" ? open().is("due_date", null).order("priority", { ascending: false }).order("created_at").limit(8) : Promise.resolve({ data: [], count: 0 }),
    k === "diaria" ? Promise.resolve({ count: 0 }) : biz(supabase.from("tasks").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "done")
      .gte("completed_at", `${p.start}T00:00:00Z`).lte("completed_at", `${p.end}T23:59:59Z`)),
    k === "diaria" ? Promise.resolve({ count: 0 }) : biz(supabase.from("tasks").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "open")),
    k === "diaria" ? Promise.resolve({ data: [] }) : open().order("created_at").limit(5),
  ]);

  // --------------------------------------------------------------- eventos que vienen
  const { data: evRows } = await biz(supabase.from("events").select("id,title,location,all_day,start_date,start_time,end_date,recurrence").eq("workspace_id", workspaceId)
    .lte("start_date", p.ahead.to).or(`end_date.gte.${p.ahead.from},recurrence.not.is.null`)).limit(1000);
  const events = eventOccurrences(evRows ?? [], p.ahead.from, p.ahead.to).sort((a, b) => (a.date + (a.startTime ?? "")).localeCompare(b.date + (b.startTime ?? "")))
    .slice(0, 30).map((e) => ({ id: e.id, title: e.title, date: e.date, time: e.startTime }));

  // --------------------------------------------------------------- correo y mensajes sin responder
  const [{ data: mailAccs }, { data: socAccs }] = await Promise.all([
    biz(supabase.from("mail_accounts").select("id, email").eq("user_id", userId)),
    biz(supabase.from("social_accounts").select("id, username, platform").eq("workspace_id", workspaceId)),
  ]);
  // Correo sin responder (los mensajes de Instagram y TikTok se quitaron: `social` queda a 0 para las fotos antiguas).
  const mailUnread = mailAccs?.length ? await supabase.from("mail_messages").select("id, from_name, from_address, subject", { count: "exact" }).eq("user_id", userId).in("account_id", mailAccs.map((a) => a.id))
    .is("triage", null).eq("is_read", false).order("received_at", { ascending: false }).limit(8) : { data: [], count: 0 };
  const inbox = {
    mail: mailUnread.count ?? 0, social: 0,
    items: (mailUnread.data ?? []).map((m) => ({ key: `correo:${m.id}`, channel: "correo" as const, person: m.from_name || m.from_address || "Desconocido", preview: m.subject ?? "", href: `/correo?abrir=${m.id}` })),
  };

  // --------------------------------------------------------------- stock que falta (las tareas «Pedir …» abiertas lo reflejan)
  const { data: stockTasks } = await biz(supabase.from("tasks").select("id, title, business_id").eq("workspace_id", workspaceId).eq("status", "open").not("stock_key", "is", null)).limit(30);

  // --------------------------------------------------------------- redes (semanal y mensual)
  let social: ReviewData["social"] = null;
  if (k !== "diaria" && socAccs?.length) {
    const ids = socAccs.map((a) => a.id);
    const [{ data: daily }, { data: media }] = await Promise.all([
      supabase.from("social_daily").select("account_id, day, followers").eq("workspace_id", workspaceId).in("account_id", ids).gte("day", p.previous.to).lte("day", p.end).not("followers", "is", null).order("day"),
      supabase.from("social_media").select("caption, permalink, interactions, likes, comments, posted_at").eq("workspace_id", workspaceId).in("account_id", ids)
        .gte("posted_at", `${p.start}T00:00:00Z`).lte("posted_at", `${p.end}T23:59:59Z`).limit(300),
    ]);
    const accounts = socAccs.map((a) => {
      const rows = (daily ?? []).filter((d) => d.account_id === a.id);
      const first = rows[0]?.followers ?? null, last = rows.at(-1)?.followers ?? null;
      return { username: a.username ?? "", platform: a.platform, now: last, gained: first != null && last != null ? last - first : null };
    });
    const score = (m: { interactions: number | null; likes: number | null; comments: number | null }) => m.interactions ?? (m.likes ?? 0) + (m.comments ?? 0);
    const best = (media ?? []).sort((a, b) => score(b) - score(a))[0];
    social = { gained: accounts.reduce((s, a) => s + (a.gained ?? 0), 0), accounts, best: best ? { caption: (best.caption ?? "").slice(0, 140), permalink: best.permalink, interactions: score(best) } : null };
  }

  const goals = k !== "diaria" && extras.goals ? await extras.goals().catch(() => null) : null;

  return {
    v: 1, kind: k, start: p.start, end: p.end, business, generatedAt: new Date().toISOString(),
    money, monthToDate: mtd,
    orders: {
      count: latest.count ?? (latest.data ?? []).length,
      latest: (latest.data ?? []).map((o) => ({ id: o.id, businessId: o.business_id, label: orderLabel(o), totalCents: Number(o.total_cents), status: o.status })),
      topProducts: (top.data ?? []).map((r: { label: string; units: number; revenue_cents: number }) => ({ label: r.label, units: Number(r.units), revenue: Number(r.revenue_cents) })),
    },
    receivable: {
      totalCents: dueRows.reduce((s, o) => s + Number(o.due_cents ?? 0), 0), count: dueRows.length,
      list: dueRows.slice(0, 8).map((o) => ({ id: o.id, businessId: o.business_id, label: orderLabel(o), totalCents: Number(o.total_cents), dueCents: Number(o.due_cents ?? 0) })),
    },
    expensesByCategory: (cats.data ?? []).map((r: { label: string; amount_cents: number; color: string | null }) => ({ label: r.label, amount: Number(r.amount_cents), color: r.color })),
    tasks: {
      today: (tToday.data ?? []).map(toRef), overdue: (tOver.data ?? []).map(toRef), noDate: (tNoDate.data ?? []).map(toRef), noDateTotal: tNoDate.count ?? 0,
      done: tDone.count ?? 0, open: tOpen.count ?? 0, oldest: (tOldest.data ?? []).map(toRef),
    },
    events, inbox,
    stock: (stockTasks ?? []).map((t) => ({ title: t.title, businessId: t.business_id, taskId: t.id })),
    social, goals, priorities: [],
  };
}

/** Texto del aviso: lo esencial en una o dos líneas. */
export function reviewPushText(d: ReviewData, fmt: (cents: number) => string): { title: string; body: string } {
  const parts: string[] = [];
  if (d.kind === "diaria") {
    parts.push(`Ayer: ${fmt(d.money.cur.profit)} de beneficio`);
    const t = d.tasks.today.length + d.tasks.overdue.length;
    if (t) parts.push(`${t} ${t === 1 ? "tarea" : "tareas"} para hoy`);
  } else {
    parts.push(`${d.kind === "semanal" ? "Semana" : "Mes"}: ${fmt(d.money.cur.profit)} de beneficio`);
    parts.push(`${d.tasks.done} tareas hechas`);
  }
  const msgs = d.inbox.mail + d.inbox.social;
  if (msgs) parts.push(`${msgs} sin responder`);
  if (d.stock.length) parts.push(`${d.stock.length} por pedir`);
  return { title: `Revisión ${d.kind} lista`, body: parts.join(" · ") };
}

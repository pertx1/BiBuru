import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { nowLocal, startOfMonth } from "@/lib/dates";
import type { AdminClient } from "@/lib/supabase/admin";

/** Datos del widget de iPhone (solo lectura, con la clave personal). */
export const hashWidgetToken = (t: string) => createHash("sha256").update(t).digest("hex");
export function newWidgetToken() {
  const token = `bw_${randomBytes(24).toString("base64url")}`;
  return { token, hash: hashWidgetToken(token) };
}

export type WidgetData = {
  tasks: { today: number; overdue: number; list: { title: string; time: string | null; overdue: boolean }[] };
  money: { todayIncome: number; monthIncome: number; monthProfit: number };
  orders: { toDo: number };
  receivable: number;
  stockToOrder: number;
};

/** null = clave no válida. Todo filtrado por el espacio de la clave (la clave de servicio salta el RLS). */
export async function widgetData(admin: AdminClient, token: string): Promise<WidgetData | null> {
  const { data: t } = await admin.from("widget_tokens").select("id, user_id, workspace_id").eq("token_hash", hashWidgetToken(token)).maybeSingle();
  if (!t) return null;
  const ws = t.workspace_id;
  const { data: p } = await admin.from("profiles").select("timezone").eq("user_id", t.user_id).maybeSingle();
  const today = nowLocal(new Date(), p?.timezone ?? "Europe/Madrid").date;
  const month = startOfMonth(today);
  const [tasks, todayStats, monthStats, toDo, due, stock] = await Promise.all([
    admin.from("tasks").select("title, due_date, due_time, priority").eq("workspace_id", ws).eq("status", "open").not("due_date", "is", null).lte("due_date", today)
      .order("due_date").order("due_time", { nullsFirst: false }).order("priority", { ascending: false }).limit(30),
    admin.rpc("stats_totals", { ws, p_from: today, p_to: today }),
    admin.rpc("stats_totals", { ws, p_from: month, p_to: today }),
    admin.from("orders").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("status", "sin_hacer"),
    admin.from("orders").select("due_cents").eq("workspace_id", ws).gt("due_cents", 0).limit(5000),
    admin.from("tasks").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("status", "open").not("stock_key", "is", null),
  ]);
  const sum = (rows: { income_cents: number; expense_cents: number }[] | null, k: "income_cents" | "expense_cents") => (rows ?? []).reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const list = (tasks.data ?? []).map((x) => ({ title: x.title.slice(0, 80), time: x.due_time ? x.due_time.slice(0, 5) : null, overdue: x.due_date! < today }));
  // Primero las de hoy (por hora), luego las atrasadas.
  list.sort((a, b) => Number(a.overdue) - Number(b.overdue) || (a.time ?? "99").localeCompare(b.time ?? "99"));
  await admin.from("widget_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", t.id);
  return {
    tasks: { today: list.filter((x) => !x.overdue).length, overdue: list.filter((x) => x.overdue).length, list },
    money: { todayIncome: sum(todayStats.data, "income_cents"), monthIncome: sum(monthStats.data, "income_cents"), monthProfit: sum(monthStats.data, "income_cents") - sum(monthStats.data, "expense_cents") },
    orders: { toDo: toDo.count ?? 0 },
    receivable: (due.data ?? []).reduce((s, r) => s + Number(r.due_cents ?? 0), 0),
    stockToOrder: stock.count ?? 0,
  };
}

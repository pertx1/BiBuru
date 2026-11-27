import "server-only";
import { z } from "zod";
import { addDays, formatDate } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/schemas";
import { descendantIds } from "@/lib/categories/tree";
import { expandEvents } from "@/lib/tasks/calendar";
import { formatGoalValue, progressPct, type GoalAuto, type GoalMeasure } from "@/lib/tasks/goals";
import { garmentLabel } from "@/lib/production/stock";
import type { DigestContent } from "@/lib/news/digest";
import { changeText, PERIODS, periodRange, previousRange, type Range } from "./format";
import { tool, ToolError, type McpTool } from "./protocol";
import { businessArg, categories, dayArg, findCategory, link, pathOf, today, type McpCtx } from "./tools";

/**
 * Herramientas de solo lectura: que Claude pueda ver todo BiBuru (negocios, ventas, pedidos, gastos, deudas, stock,
 * calendario, objetivos, redes, vídeos, notas, noticias y revisiones). Clave de servicio: SIEMPRE se filtra por el
 * espacio de la clave. No cambian nada.
 */
const s = (max: number) => z.string().trim().max(max);
const negocio = s(120).optional().describe("Nombre del negocio (vacío = todos)");
const periodo = z.enum(PERIODS).optional().describe("hoy, ayer, semana, semana_pasada, mes, mes_pasado, ultimos_30, trimestre, año, año_pasado o todo");
const desde = s(40).optional().describe("Fecha inicial (2026-10-01, 01/10/2026, «lunes»…); con desde/hasta se ignora periodo");
const hasta = s(40).optional();
const eur = (cents: number | null | undefined) => formatEUR(Number(cents ?? 0));
const esc = (t: string) => t.replace(/[%_\\]/g, "\\$&");

function rangeOf(c: McpCtx, a: { periodo?: (typeof PERIODS)[number]; desde?: string; hasta?: string }, fallback: (typeof PERIODS)[number] = "mes"): Range {
  const r = periodRange(a, today(c), fallback);
  if (!r) throw new ToolError("No entiendo las fechas. Usa 2026-10-01, 01/10/2026, «hoy» o «lunes».");
  return r;
}

async function businesses(c: McpCtx) {
  const { data } = await c.db.from("businesses").select("id, name, color, archived, production_enabled").eq("workspace_id", c.workspaceId).order("sort_order").order("name");
  return data ?? [];
}
const bizName = (list: { id: string; name: string }[], id: string | null) => (id ? list.find((b) => b.id === id)?.name ?? "?" : "—");

async function totals(c: McpCtx, r: Range, biz: string | null) {
  const { data } = await c.db.rpc("stats_totals", { ws: c.workspaceId, p_from: r.from, p_to: r.to, ...(biz ? { p_business: biz } : {}) });
  const sum = (k: "income_cents" | "expense_cents" | "orders_count") => (data ?? []).reduce((t, x) => t + Number(x[k] ?? 0), 0);
  return { income: sum("income_cents"), expense: sum("expense_cents"), orders: sum("orders_count"), rows: data ?? [] };
}

const itemsText = (items: { product_name: string; color: string | null; size: string | null; quantity: number; garment?: string | null }[]) =>
  items.map((i) => `${i.quantity}× ${i.product_name}${i.color ? ` ${i.color}` : ""}${i.size ? ` ${i.size}` : ""}${i.garment === "sudadera" || i.garment === "camiseta" ? ` (${i.garment})` : ""}`).join(", ");

export const MCP_READ_TOOLS: McpTool<McpCtx>[] = [
  tool({
    name: "listar_negocios", title: "Ver negocios", readOnly: true,
    description: "Los negocios con sus ventas, gastos y beneficio de este mes, pedidos por hacer y lo que deben.",
    input: z.object({ incluir_archivados: z.boolean().optional() }),
    async run(c, a) {
      const list = (await businesses(c)).filter((b) => a.incluir_archivados || !b.archived);
      if (!list.length) return "Aún no hay negocios.";
      const r = rangeOf(c, { periodo: "mes" });
      const [t, pend, due] = await Promise.all([
        totals(c, r, null),
        c.db.from("orders").select("business_id").eq("workspace_id", c.workspaceId).in("status", ["sin_hacer", "en_casa", "en_paquete"]).limit(5000),
        c.db.from("orders").select("business_id, due_cents").eq("workspace_id", c.workspaceId).gt("due_cents", 0).limit(5000),
      ]);
      return [`Negocios (cifras de ${r.label}):`, ...list.map((b) => {
        const row = t.rows.find((x) => x.business_id === b.id);
        const inc = Number(row?.income_cents ?? 0), exp = Number(row?.expense_cents ?? 0);
        const todo = (pend.data ?? []).filter((o) => o.business_id === b.id).length;
        const owed = (due.data ?? []).filter((o) => o.business_id === b.id).reduce((x, o) => x + Number(o.due_cents), 0);
        return `- ${b.name}${b.archived ? " (archivado)" : ""}: ventas ${eur(inc)}, gastos ${eur(exp)}, beneficio ${eur(inc - exp)}, ${Number(row?.orders_count ?? 0)} pedidos · ${todo} por hacer/enviar · te deben ${eur(owed)}${b.production_enabled ? " · con producción (prendas y DTF)" : ""}`;
      })].join("\n");
    },
  }),

  tool({
    name: "resumen_negocio", title: "Resumen de un negocio", readOnly: true,
    description: "Ventas, gastos, beneficio y número de pedidos de un periodo (comparado con el anterior), productos más vendidos, gastos por categoría, pedidos por estado y deudas. Sin negocio = todos juntos.",
    input: z.object({ negocio, periodo, desde, hasta }),
    async run(c, a) {
      const biz = (await businessArg(c, a.negocio)) ?? null;
      const r = rangeOf(c, a), prev = previousRange(r);
      const ws = c.workspaceId;
      const byBiz = <T extends { eq: (k: string, v: string) => T }>(q: T) => (biz ? q.eq("business_id", biz) : q);
      const [now, before, top, cats, states, due] = await Promise.all([
        totals(c, r, biz), totals(c, prev, biz),
        c.db.rpc("stats_top_products", { ws, p_from: r.from, p_to: r.to, max_rows: 8, ...(biz ? { p_business: biz } : {}) }),
        c.db.rpc("stats_expenses_by_category", { ws, p_from: r.from, p_to: r.to, max_rows: 8, ...(biz ? { p_business: biz } : {}) }),
        byBiz(c.db.from("orders").select("status").eq("workspace_id", ws).neq("status", "enviado").neq("status", "cancelado")).limit(5000),
        byBiz(c.db.from("orders").select("due_cents").eq("workspace_id", ws).gt("due_cents", 0)).limit(5000),
      ]);
      const counts = new Map<string, number>();
      for (const o of states.data ?? []) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
      const profit = now.income - now.expense, profitBefore = before.income - before.expense;
      return [
        `${a.negocio ? (await businesses(c)).find((b) => b.id === biz)?.name : "Todos los negocios"} · ${r.label} (${formatDate(r.from)}–${formatDate(r.to)})`,
        `Ventas: ${eur(now.income)} (${changeText(now.income, before.income)} vs ${eur(before.income)} del periodo anterior)`,
        `Gastos: ${eur(now.expense)} (${changeText(now.expense, before.expense)})`,
        `Beneficio: ${eur(profit)} (${changeText(profit, profitBefore)})${now.income ? ` · margen ${Math.round((profit / now.income) * 100)} %` : ""}`,
        `Pedidos: ${now.orders} (${changeText(now.orders, before.orders)})${now.orders ? ` · ticket medio ${eur(Math.round(now.income / now.orders))}` : ""}`,
        `\nMás vendidos:\n${(top.data ?? []).map((p) => `- ${p.label}: ${p.units} uds · ${eur(p.revenue_cents)}`).join("\n") || "—"}`,
        `\nGastos por categoría:\n${(cats.data ?? []).map((g) => `- ${g.label}: ${eur(g.amount_cents)}`).join("\n") || "—"}`,
        `\nPedidos abiertos: ${[...counts].map(([st, n]) => `${ORDER_STATUS_LABEL[st as OrderStatus] ?? st} ${n}`).join(" · ") || "ninguno"}`,
        `Te deben: ${eur((due.data ?? []).reduce((x, o) => x + Number(o.due_cents), 0))}`,
      ].join("\n");
    },
  }),

  tool({
    name: "estadisticas_mensuales", title: "Ventas mes a mes", readOnly: true,
    description: "Ventas, gastos y beneficio de cada mes (los últimos N meses), de un negocio o de todos.",
    input: z.object({ negocio, meses: z.number().int().min(1).max(36).default(12) }),
    async run(c, a) {
      const biz = (await businessArg(c, a.negocio)) ?? null;
      const t = today(c);
      const start = new Date(`${t.slice(0, 7)}-01T12:00:00Z`);
      start.setUTCMonth(start.getUTCMonth() - (a.meses - 1));
      const { data, error } = await c.db.rpc("stats_monthly", { ws: c.workspaceId, p_from: start.toISOString().slice(0, 10), p_to: t, ...(biz ? { p_business: biz } : {}) });
      if (error) throw new Error(error.message);
      return (data ?? []).map((m) => `- ${m.month.slice(0, 7)}: ventas ${eur(m.income_cents)} · gastos ${eur(m.expense_cents)} · beneficio ${eur(Number(m.income_cents) - Number(m.expense_cents))}`).join("\n") || "Sin datos.";
    },
  }),

  tool({
    name: "listar_pedidos", title: "Ver pedidos", readOnly: true,
    description: "Pedidos con cliente, líneas, total, cobrado y lo que falta. Filtros: negocio, estado, periodo o fechas, cliente, texto (producto, nº, notas) y solo con deuda.",
    input: z.object({
      negocio, estado: z.enum(["sin_hacer", "en_casa", "en_paquete", "enviado", "sin_llegar", "cancelado", "abiertos"]).optional().describe("«abiertos» = todo lo que no está enviado ni cancelado"),
      periodo, desde, hasta, cliente: s(120).optional(), buscar: s(100).optional(), con_deuda: z.boolean().optional(), limite: z.number().int().min(1).max(100).default(30),
    }),
    async run(c, a) {
      const list = await businesses(c);
      const biz = (await businessArg(c, a.negocio)) ?? null;
      let q = c.db.from("orders").select("id, business_id, order_number, order_date, customer, channel, status, total_cents, paid_cents, due_cents, notes, order_items(product_name, color, size, quantity, garment)").eq("workspace_id", c.workspaceId);
      if (biz) q = q.eq("business_id", biz);
      if (a.estado === "abiertos") q = q.not("status", "in", "(enviado,cancelado)");
      else if (a.estado) q = q.eq("status", a.estado);
      if (a.periodo || a.desde || a.hasta) { const r = rangeOf(c, a); q = q.gte("order_date", r.from).lte("order_date", r.to); }
      if (a.cliente) q = q.ilike("customer", `%${esc(a.cliente)}%`);
      if (a.con_deuda) q = q.gt("due_cents", 0);
      const { data, error } = await q.order("order_date", { ascending: false }).limit(a.buscar ? 500 : a.limite);
      if (error) throw new Error(error.message);
      const needle = a.buscar?.toLowerCase();
      const rows = (data ?? []).filter((o) => !needle || [o.order_number, o.notes, o.customer, ...o.order_items.map((i) => `${i.product_name} ${i.color ?? ""}`)].some((x) => x?.toLowerCase().includes(needle))).slice(0, a.limite);
      if (!rows.length) return "No hay pedidos con esos filtros.";
      const sum = rows.reduce((t, o) => t + (o.status === "cancelado" ? 0 : Number(o.total_cents)), 0);
      return [`${rows.length} pedidos · ${eur(sum)}${rows.length === a.limite ? " (puede haber más: sube el límite o filtra)" : ""}`, ...rows.map((o) =>
        `- ${formatDate(o.order_date)} · ${bizName(list, o.business_id)} · ${o.customer ?? "sin cliente"}${o.order_number ? ` (nº ${o.order_number})` : ""} · ${ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status} · ${eur(o.total_cents)}${Number(o.due_cents) > 0 ? ` · FALTA COBRAR ${eur(o.due_cents)}` : ""}${o.channel ? ` · ${o.channel}` : ""}\n  ${itemsText(o.order_items)} · id: ${o.id}`)].join("\n");
    },
  }),

  tool({
    name: "ver_pedido", title: "Ver un pedido", readOnly: true,
    description: "Un pedido entero: líneas con precio y coste, cobros, notas y lo que descontó del stock.",
    input: z.object({ id: z.uuid() }),
    async run(c, a) {
      const { data: o } = await c.db.from("orders").select("*, order_items(product_name, color, size, garment, quantity, unit_price_cents, unit_cost_cents, stock_effects), order_payments(paid_on, amount_cents, method, note)").eq("id", a.id).eq("workspace_id", c.workspaceId).maybeSingle();
      if (!o) throw new ToolError("No existe ese pedido.");
      const list = await businesses(c);
      const lines = o.order_items.map((i) => {
        const fx = Array.isArray(i.stock_effects) ? (i.stock_effects as { label?: string; qty?: number }[]).map((e) => `${e.qty}× ${e.label}`).join(" + ") : "";
        return `- ${itemsText([i])} · ${eur(i.unit_price_cents)}/ud (coste ${eur(i.unit_cost_cents)})${fx ? ` · stock: ${fx}` : ""}`;
      });
      return [
        `Pedido${o.order_number ? ` nº ${o.order_number}` : ""} · ${bizName(list, o.business_id)} · ${formatDate(o.order_date)}`,
        `Cliente: ${o.customer ?? "—"} · Canal: ${o.channel ?? "—"} · Estado: ${ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}`,
        `Total ${eur(o.total_cents)} · coste ${eur(o.cost_cents)} · cobrado ${eur(o.paid_cents)} · falta ${eur(o.due_cents)}`,
        "Líneas:", ...lines,
        o.order_payments.length ? `Cobros:\n${o.order_payments.map((p) => `- ${formatDate(p.paid_on)} ${eur(p.amount_cents)} (${p.method}${p.note ? `, ${p.note}` : ""})`).join("\n")}` : "Sin cobros.",
        o.notes ? `Notas: ${o.notes}` : "",
        link(c, `/negocios/${o.business_id}/pedidos?abrir=${o.id}`),
      ].filter(Boolean).join("\n");
    },
  }),

  tool({
    name: "quien_me_debe", title: "Quién me debe", readOnly: true,
    description: "Clientes con pedidos sin cobrar del todo: cuánto deben y desde cuándo.",
    input: z.object({ negocio }),
    async run(c, a) {
      const biz = (await businessArg(c, a.negocio)) ?? null;
      let q = c.db.from("orders").select("id, customer, order_date, due_cents, business_id").eq("workspace_id", c.workspaceId).gt("due_cents", 0);
      if (biz) q = q.eq("business_id", biz);
      const { data } = await q.order("order_date").limit(5000);
      if (!data?.length) return "Nadie te debe nada. 🎉";
      const by = new Map<string, { total: number; n: number; oldest: string }>();
      for (const o of data) { const k = o.customer?.trim() || "Sin cliente"; const x = by.get(k) ?? { total: 0, n: 0, oldest: o.order_date }; x.total += Number(o.due_cents); x.n++; if (o.order_date < x.oldest) x.oldest = o.order_date; by.set(k, x); }
      const t = today(c);
      return [`Te deben ${eur(data.reduce((x, o) => x + Number(o.due_cents), 0))} en ${data.length} pedidos:`,
        ...[...by].sort((x, y) => y[1].total - x[1].total).map(([k, v]) => `- ${k}: ${eur(v.total)} (${v.n} ${v.n === 1 ? "pedido" : "pedidos"}, el más antiguo de hace ${Math.round((Date.parse(t) - Date.parse(v.oldest)) / 864e5)} días)`)].join("\n");
    },
  }),

  tool({
    name: "listar_gastos", title: "Ver gastos", readOnly: true,
    description: "Gastos con concepto, proveedor, categoría e importe en un periodo (por defecto este mes), con el total.",
    input: z.object({ negocio, periodo, desde, hasta, buscar: s(100).optional(), limite: z.number().int().min(1).max(200).default(50) }),
    async run(c, a) {
      const list = await businesses(c);
      const biz = (await businessArg(c, a.negocio)) ?? null;
      const r = rangeOf(c, a);
      let q = c.db.from("expenses").select("expense_date, amount_cents, concept, supplier, payment_method, business_id, expense_categories(name)").eq("workspace_id", c.workspaceId).gte("expense_date", r.from).lte("expense_date", r.to);
      if (biz) q = q.eq("business_id", biz);
      if (a.buscar) q = q.or(`concept.ilike.%${esc(a.buscar).replace(/[,()]/g, " ")}%,supplier.ilike.%${esc(a.buscar).replace(/[,()]/g, " ")}%`);
      const { data, error } = await q.order("expense_date", { ascending: false }).limit(a.limite);
      if (error) throw new Error(error.message);
      if (!data?.length) return `Sin gastos ${r.label}.`;
      const cat = (e: { expense_categories: { name: string } | { name: string }[] | null }) => (Array.isArray(e.expense_categories) ? e.expense_categories[0]?.name : e.expense_categories?.name) ?? "sin categoría";
      return [`Gastos ${r.label}: ${eur(data.reduce((t, e) => t + Number(e.amount_cents), 0))}${data.length === a.limite ? " (límite alcanzado)" : ""}`,
        ...data.map((e) => `- ${formatDate(e.expense_date)} · ${bizName(list, e.business_id)} · ${eur(e.amount_cents)} · ${e.concept ?? "—"}${e.supplier ? ` (${e.supplier})` : ""} · ${cat(e)}`)].join("\n");
    },
  }),

  tool({
    name: "ver_stock", title: "Ver stock", readOnly: true,
    description: "Stock de un negocio: prendas por modelo y talla, DTF y otros artículos, con lo que hay que pedir (a 0 o por debajo del mínimo).",
    input: z.object({ negocio: s(120).min(1), solo_pedir: z.boolean().optional().describe("Solo lo que hay que pedir") }),
    async run(c, a) {
      const biz = await businessArg(c, a.negocio);
      if (!biz) throw new ToolError("Di de qué negocio.");
      const [t, d, it, tasks] = await Promise.all([
        c.db.from("tshirt_stocks").select("model, size, quantity, min_quantity").eq("workspace_id", c.workspaceId).eq("business_id", biz).order("model").order("size"),
        c.db.from("dtf_stocks").select("name, variant, quantity, min_quantity").eq("workspace_id", c.workspaceId).eq("business_id", biz).order("name"),
        c.db.from("stock_items").select("name, variant, quantity, min_quantity").eq("workspace_id", c.workspaceId).eq("business_id", biz).order("name"),
        c.db.from("tasks").select("title").eq("workspace_id", c.workspaceId).eq("business_id", biz).eq("status", "open").not("stock_key", "is", null).limit(100),
      ]);
      const low = (q: number, min: number) => q <= 0 || q < min;
      const fmt = (label: string, q: number, min: number) => `- ${label}: ${q}${min ? ` (mín. ${min})` : ""}${low(q, min) ? " ⚠️ PEDIR" : ""}`;
      const keep = <T extends { quantity: number; min_quantity: number }>(rows: T[] | null) => (rows ?? []).filter((r) => !a.solo_pedir || low(r.quantity, r.min_quantity));
      const out = [
        t.data?.length ? `Prendas:\n${keep(t.data).map((r) => fmt(`${garmentLabel(r.model)} ${r.size}`, r.quantity, r.min_quantity)).join("\n") || "—"}` : "",
        d.data?.length ? `DTF:\n${keep(d.data).map((r) => fmt(`DTF ${r.name}${r.variant === "UNICO" ? "" : ` ${r.variant.toLowerCase()}`}`, r.quantity, r.min_quantity)).join("\n") || "—"}` : "",
        it.data?.length ? `Otros artículos:\n${keep(it.data).map((r) => fmt(`${r.name}${r.variant ? ` ${r.variant}` : ""}`, r.quantity, r.min_quantity)).join("\n") || "—"}` : "",
        tasks.data?.length ? `Tareas de pedir abiertas: ${tasks.data.map((x) => x.title).join(" · ")}` : "",
        "(Las cantidades ya tienen restados los pedidos vinculados.)",
      ].filter(Boolean);
      return out.length > 1 ? out.join("\n\n") : "Este negocio no tiene stock.";
    },
  }),

  tool({
    name: "ver_calendario", title: "Ver calendario", readOnly: true,
    description: "Eventos, tareas con fecha y publicaciones de redes programadas entre dos fechas (por defecto, de hoy a 7 días).",
    input: z.object({ desde, hasta }),
    async run(c, a) {
      const from = dayArg(c, a.desde) ?? today(c), to = dayArg(c, a.hasta) ?? addDays(from, 7);
      if (to < from) throw new ToolError("«hasta» va antes que «desde».");
      const ws = c.workspaceId;
      const [ev, tk, po, list] = await Promise.all([
        c.db.from("events").select("id, title, notes, location, all_day, start_date, start_time, end_date, end_time, recurrence, business_id").eq("workspace_id", ws).or(`recurrence.not.is.null,and(start_date.lte.${to},end_date.gte.${from})`).limit(1000),
        c.db.from("tasks").select("title, due_date, due_time, status, business_id").eq("workspace_id", ws).gte("due_date", from).lte("due_date", to).order("due_date").limit(300),
        c.db.from("social_posts").select("title, caption, scheduled_at, status, business_id").eq("workspace_id", ws).gte("scheduled_at", `${from}T00:00:00Z`).lte("scheduled_at", `${addDays(to, 1)}T00:00:00Z`).limit(200),
        businesses(c),
      ]);
      type Row = { date: string; time: string | null; text: string };
      const rows: Row[] = [
        ...expandEvents(ev.data ?? [], from, to).map((e) => ({ date: e.date, time: e.startTime, text: `📅 ${e.title}${e.location ? ` (${e.location})` : ""}${e.businessId ? ` · ${bizName(list, e.businessId)}` : ""}` })),
        ...(tk.data ?? []).map((t) => ({ date: t.due_date!, time: t.due_time?.slice(0, 5) ?? null, text: `${t.status === "done" ? "✅" : "☐"} ${t.title}${t.business_id ? ` · ${bizName(list, t.business_id)}` : ""}` })),
        ...(po.data ?? []).map((p) => { const d = new Date(p.scheduled_at!); return { date: d.toLocaleDateString("sv-SE", { timeZone: c.timezone }), time: d.toLocaleTimeString("es-ES", { timeZone: c.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }), text: `📣 ${p.title || p.caption.slice(0, 60) || "Publicación"} (${p.status})${p.business_id ? ` · ${bizName(list, p.business_id)}` : ""}` }; }),
      ].sort((x, y) => x.date.localeCompare(y.date) || (x.time ?? "").localeCompare(y.time ?? ""));
      if (!rows.length) return `Nada entre el ${formatDate(from)} y el ${formatDate(to)}.`;
      const out: string[] = [];
      let day = "";
      for (const r of rows) {
        if (r.date !== day) { day = r.date; out.push(`\n${formatDate(r.date)}`); }
        out.push(`- ${r.time ? `${r.time} ` : ""}${r.text}`);
      }
      return out.join("\n").trim();
    },
  }),

  tool({
    name: "listar_objetivos", title: "Ver objetivos", readOnly: true,
    description: "Objetivos activos con su progreso (los automáticos de ventas o beneficio se calculan al momento), fecha límite e hitos.",
    input: z.object({ incluir_terminados: z.boolean().optional() }),
    async run(c, a) {
      let q = c.db.from("goals").select("id, title, measure_type, target_value, current_value, auto_source, deadline, period_start, status, business_id, created_at").eq("workspace_id", c.workspaceId);
      if (!a.incluir_terminados) q = q.eq("status", "active");
      const { data: goals } = await q.order("deadline", { nullsFirst: false }).limit(50);
      if (!goals?.length) return "No hay objetivos.";
      const ids = goals.map((g) => g.id);
      const [ms, tk, list] = await Promise.all([
        c.db.from("goal_milestones").select("goal_id, done").eq("workspace_id", c.workspaceId).in("goal_id", ids),
        c.db.from("tasks").select("goal_id, status").eq("workspace_id", c.workspaceId).in("goal_id", ids),
        businesses(c),
      ]);
      const out = await Promise.all(goals.map(async (g) => {
        const live: { metricCents?: number; tasksDone?: number; tasksTotal?: number; milestonesDone?: number; milestonesTotal?: number } = {};
        if (g.auto_source === "income" || g.auto_source === "profit") {
          const t = await totals(c, { from: g.period_start ?? g.created_at.slice(0, 10), to: today(c), label: "" }, g.business_id);
          live.metricCents = g.auto_source === "income" ? t.income : t.income - t.expense;
        }
        const mine = (tk.data ?? []).filter((x) => x.goal_id === g.id), mm = (ms.data ?? []).filter((x) => x.goal_id === g.id);
        Object.assign(live, { tasksTotal: mine.length, tasksDone: mine.filter((x) => x.status === "done").length, milestonesTotal: mm.length, milestonesDone: mm.filter((x) => x.done).length });
        const p = progressPct({ measure_type: g.measure_type as GoalMeasure, target_value: g.target_value, current_value: g.current_value, auto_source: g.auto_source as GoalAuto }, live);
        return `- ${g.title}${g.business_id ? ` (${bizName(list, g.business_id)})` : ""}: ${formatGoalValue(g.measure_type as GoalMeasure, p.value)} de ${formatGoalValue(g.measure_type as GoalMeasure, p.target)} · ${p.pct} %${p.reached ? " ✅" : ""}${g.deadline ? ` · hasta el ${formatDate(g.deadline)}` : ""}${g.status !== "active" ? ` · ${g.status}` : ""}`;
      }));
      return out.join("\n");
    },
  }),

  tool({
    name: "ver_redes", title: "Ver redes sociales", readOnly: true,
    description: "Cuentas de Instagram y TikTok (seguidores y estado), publicaciones programadas o con error y las mejores de los últimos 30 días con sus métricas.",
    input: z.object({ negocio }),
    async run(c, a) {
      const biz = (await businessArg(c, a.negocio)) ?? null;
      const ws = c.workspaceId;
      let qa = c.db.from("social_accounts").select("id, platform, username, followers_count, status, business_id").eq("workspace_id", ws);
      if (biz) qa = qa.eq("business_id", biz);
      const [{ data: accs }, list] = await Promise.all([qa, businesses(c)]);
      if (!accs?.length) return "No hay cuentas de redes conectadas.";
      const ids = accs.map((x) => x.id);
      let qp = c.db.from("social_posts").select("title, caption, scheduled_at, status, social_post_targets(status, error, account_id)").eq("workspace_id", ws).in("status", ["programada", "publicando", "error", "borrador"]);
      if (biz) qp = qp.eq("business_id", biz);
      const [{ data: posts }, { data: media }] = await Promise.all([
        qp.order("scheduled_at", { nullsFirst: false }).limit(30),
        c.db.from("social_media").select("account_id, caption, posted_at, views, likes, comments, shares, saves, permalink").eq("workspace_id", ws).in("account_id", ids).gte("posted_at", new Date(Date.now() - 30 * 864e5).toISOString()).order("interactions", { ascending: false, nullsFirst: false }).limit(10),
      ]);
      const user = (id: string) => { const x = accs.find((y) => y.id === id); return x ? `${x.platform === "tiktok" ? "TikTok" : "IG"} @${x.username}` : "?"; };
      return [
        "Cuentas:", ...accs.map((x) => `- ${x.platform === "tiktok" ? "TikTok" : "Instagram"} @${x.username ?? "?"} · ${x.followers_count ?? "?"} seguidores · ${x.status === "ok" ? "conectada" : x.status === "expiring" ? "caduca pronto" : "hay que reconectar"} · ${bizName(list, x.business_id)}`),
        `\nPublicaciones pendientes:\n${(posts ?? []).map((p) => `- ${p.scheduled_at ? new Date(p.scheduled_at).toLocaleString("es-ES", { timeZone: c.timezone, dateStyle: "short", timeStyle: "short" }) : "sin fecha"} · ${p.title || p.caption.slice(0, 60) || "(sin texto)"} · ${p.status}${p.social_post_targets.filter((t) => t.error).map((t) => ` · ${user(t.account_id)}: ${t.error}`).join("")}`).join("\n") || "—"}`,
        `\nMejores de los últimos 30 días:\n${(media ?? []).map((m) => `- ${user(m.account_id)} ${formatDate(m.posted_at.slice(0, 10))}: ${(m.caption ?? "").slice(0, 60).replace(/\n/g, " ")} · 👁 ${m.views ?? "–"} ❤️ ${m.likes ?? "–"} 💬 ${m.comments ?? "–"} ↗ ${m.shares ?? "–"}${m.permalink ? ` · ${m.permalink}` : ""}`).join("\n") || "—"}`,
      ].join("\n");
    },
  }),

  tool({
    name: "listar_videos", title: "Ver vídeos guardados", readOnly: true,
    description: "Vídeos de Favoritos (YouTube, TikTok) con su resumen: por proyecto/categoría (incluye subcategorías), estado o texto. Para el análisis entero, ver_video.",
    input: z.object({ proyecto: s(200).optional(), estado: z.enum(["por_ver", "visto", "aplicado", "archivado"]).optional(), buscar: s(100).optional(), limite: z.number().int().min(1).max(60).default(20) }),
    async run(c, a) {
      const cats = await categories(c);
      let q = c.db.from("saved_videos").select("id, title, url, summary, status, utility, category_id, channel").eq("workspace_id", c.workspaceId);
      if (a.proyecto) { const cat = findCategory(cats, a.proyecto); if (!cat) throw new ToolError(`No hay ninguna categoría «${a.proyecto}».`); q = q.in("category_id", descendantIds(cats, cat.id)); }
      if (a.estado) q = q.eq("status", a.estado);
      if (a.buscar) q = q.or(`title.ilike.%${esc(a.buscar).replace(/[,()]/g, " ")}%,summary.ilike.%${esc(a.buscar).replace(/[,()]/g, " ")}%`);
      const { data } = await q.order("utility", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(a.limite);
      if (!data?.length) return "No hay vídeos con esos filtros.";
      return data.map((v) => `- ${v.title}${v.channel ? ` (${v.channel})` : ""} · ${pathOf(cats, v.category_id) ?? "sin categoría"} · ${v.status}${v.utility ? ` · utilidad ${v.utility}/5` : ""}\n  ${(v.summary ?? "sin analizar").slice(0, 220)}\n  ${v.url} · id: ${v.id}`).join("\n");
    },
  }),

  tool({
    name: "ver_video", title: "Ver un vídeo guardado", readOnly: true,
    description: "El análisis entero de un vídeo de Favoritos: resumen, puntos clave, ideas para aplicar y notas.",
    input: z.object({ id: z.uuid() }),
    async run(c, a) {
      const { data: v } = await c.db.from("saved_videos").select("title, url, channel, summary, key_points, actions, notes, status, utility, business_reason").eq("id", a.id).eq("workspace_id", c.workspaceId).maybeSingle();
      if (!v) throw new ToolError("No existe ese vídeo.");
      const list = (x: unknown) => (Array.isArray(x) ? (x as unknown[]).map((i) => `- ${typeof i === "string" ? i : JSON.stringify(i)}`).join("\n") : "—");
      return [`# ${v.title}`, `${v.url}${v.channel ? ` · ${v.channel}` : ""} · ${v.status}${v.utility ? ` · utilidad ${v.utility}/5` : ""}`, `\n${v.summary ?? "Aún sin analizar."}`,
        `\nPuntos clave:\n${list(v.key_points)}`, `\nIdeas para aplicar:\n${list(v.actions)}`, v.business_reason ? `\nPara tu negocio: ${v.business_reason}` : "", v.notes ? `\nMis notas: ${v.notes}` : ""].filter(Boolean).join("\n");
    },
  }),

  tool({
    name: "listar_notas", title: "Ver notas", readOnly: true,
    description: "Notas (las últimas o por proyecto, carpeta o texto) con su id para leer_nota.",
    input: z.object({ proyecto: s(200).optional(), carpeta: s(120).optional(), buscar: s(100).optional(), limite: z.number().int().min(1).max(100).default(30) }),
    async run(c, a) {
      let q = c.db.from("notes").select("id, title, body, updated_at, pinned").eq("workspace_id", c.workspaceId);
      if (a.proyecto) { const cats = await categories(c); const cat = findCategory(cats, a.proyecto); if (!cat) throw new ToolError(`No hay ningún proyecto «${a.proyecto}».`); q = q.in("category_id", descendantIds(cats, cat.id)); }
      if (a.carpeta) {
        const { data: f } = await c.db.from("folders").select("id, name").eq("workspace_id", c.workspaceId).ilike("name", esc(a.carpeta)).limit(1).maybeSingle();
        if (!f) throw new ToolError(`No hay ninguna carpeta «${a.carpeta}».`);
        q = q.eq("folder_id", f.id);
      }
      if (a.buscar) q = q.or(`title.ilike.%${esc(a.buscar).replace(/[,()]/g, " ")}%,body.ilike.%${esc(a.buscar).replace(/[,()]/g, " ")}%`);
      const { data } = await q.order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(a.limite);
      return (data ?? []).map((n) => `- ${n.pinned ? "📌 " : ""}${n.title || n.body.slice(0, 60).replace(/\n/g, " ")} (${formatDate(n.updated_at.slice(0, 10))}) · id: ${n.id}`).join("\n") || "No hay notas.";
    },
  }),

  tool({
    name: "ver_noticias", title: "Ver noticias del día", readOnly: true,
    description: "El resumen de noticias de BiBuru de un día (por defecto hoy): titulares útiles para tus negocios, con enlace y qué hacer.",
    input: z.object({ dia: s(40).optional() }),
    async run(c, a) {
      const day = dayArg(c, a.dia) ?? today(c);
      const { data } = await c.db.from("news_digests").select("content, status").eq("workspace_id", c.workspaceId).eq("user_id", c.userId).eq("day", day).maybeSingle();
      if (!data || data.status === "pending") return `Aún no hay noticias del ${formatDate(day)}.`;
      const d = data.content as unknown as DigestContent;
      const items = d.items?.length ? d.items : d.closest ?? [];
      return [d.top?.length ? `Lo más importante:\n${d.top.map((t) => `- ${t}`).join("\n")}` : "",
        ...items.map((i) => `- ${i.title}${i.outlet ? ` (${i.outlet})` : ""}${i.summary ? `\n  ${i.summary}` : ""}${i.action ? `\n  Qué hacer: ${i.action}` : ""}\n  ${i.url}`),
        d.idea ? `\nIdea del día: ${d.idea.text} — ${d.idea.why}` : "", d.note ?? ""].filter(Boolean).join("\n") || "Sin noticias.";
    },
  }),

  tool({
    name: "ver_revision", title: "Ver revisión", readOnly: true,
    description: "La última revisión diaria, semanal o mensual: resumen, prioridades y cifras.",
    input: z.object({ tipo: z.enum(["diaria", "semanal", "mensual"]).optional() }),
    async run(c, a) {
      let q = c.db.from("reviews").select("kind, period_start, period_end, ai_summary, priorities, data").eq("workspace_id", c.workspaceId).eq("user_id", c.userId);
      if (a.tipo) q = q.eq("kind", a.tipo);
      const { data } = await q.order("period_start", { ascending: false }).limit(1).maybeSingle();
      if (!data) return "Aún no hay revisiones.";
      return [`Revisión ${data.kind} del ${formatDate(data.period_start)} al ${formatDate(data.period_end)}`, data.ai_summary ?? "",
        data.priorities?.length ? `Prioridades:\n${data.priorities.map((p) => `- ${p}`).join("\n")}` : "",
        `Datos: ${JSON.stringify(data.data).slice(0, 3000)}`].filter(Boolean).join("\n\n");
    },
  }),
];


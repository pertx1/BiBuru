/**
 * Utilidades puras del conector de Claude (con tests): fechas dichas en lenguaje normal, prioridad, el texto de
 * «lo que quedó a medias» y el formato de las listas que lee Claude.
 */
import { addDays, addMonths, diffDays, endOfMonth, formatDate, isValidISO, parseDateInput, startOfMonth, startOfWeek } from "@/lib/dates";
import { normalizeText } from "@/lib/production/text";

export const PENDING_CATEGORY = "Pendiente de Claude";

const WEEKDAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

/** «hoy», «mañana», «pasado mañana», «lunes» (el próximo), «en 3 días», 2026-11-02 o 02/11/2026. null = no se entiende. */
export function parseDay(raw: string, today: string): string | null {
  const s = normalizeText(raw).trim();
  if (!s) return null;
  if (s === "hoy") return today;
  if (s === "manana") return addDays(today, 1);
  if (s === "pasado manana" || s === "pasado") return addDays(today, 2);
  const inDays = /^en (\d{1,3}) dias?$/.exec(s);
  if (inDays) return addDays(today, Number(inDays[1]));
  const wd = WEEKDAYS.indexOf(s.replace(/^(el|este|proximo|el proximo) /, ""));
  if (wd >= 0) {
    const cur = new Date(`${today}T12:00:00Z`).getUTCDay();
    return addDays(today, ((wd - cur + 7) % 7) || 7);
  }
  const d = parseDateInput(raw.trim());
  return d && isValidISO(d) ? d : null;
}

/** «9», «9:30», «09:30», «21h» → «HH:MM». */
export function parseTime(raw: string): string | null {
  const m = /^(\d{1,2})(?:[:.h](\d{2}))?\s*h?$/i.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2] ?? 0);
  return h < 24 && min < 60 ? `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` : null;
}

export const PRIORITY = { alta: 3, media: 2, baja: 1 } as const;
export const PRIORITY_LABEL: Record<number, string> = { 3: "alta", 2: "media", 1: "baja" };

/** Notas de una tarea apuntada como pendiente desde Claude. */
export function pendingNotes(i: { source: string; whenLocal: { date: string; time: string }; missing: string; context?: string | null; link?: string | null }): string {
  const lines = [`Dejado a medias en ${i.source} el ${formatDate(i.whenLocal.date)} a las ${i.whenLocal.time.slice(0, 5)}.`, "", "Qué falta:", i.missing.trim()];
  if (i.context?.trim()) lines.push("", "Contexto:", i.context.trim());
  if (i.link?.trim()) lines.push("", `Enlace: ${i.link.trim()}`);
  return lines.join("\n");
}

export type TaskLine = { id: string; title: string; due_date: string | null; due_time: string | null; priority: number; status: string; category?: string | null; business?: string | null };

/** Una línea por tarea: «- [ ] Título · 02/11/2026 10:00 · prioridad alta · Proyecto · id: …». */
export function taskLine(t: TaskLine, today: string): string {
  const bits = [`- [${t.status === "done" ? "x" : " "}] ${t.title}`];
  if (t.due_date) bits.push(`${t.due_date < today && t.status !== "done" ? "ATRASADA " : ""}${t.due_date === today ? "hoy" : formatDate(t.due_date)}${t.due_time ? ` ${t.due_time.slice(0, 5)}` : ""}`);
  else bits.push("sin fecha");
  if (t.priority !== 2) bits.push(`prioridad ${PRIORITY_LABEL[t.priority] ?? t.priority}`);
  if (t.category) bits.push(`proyecto: ${t.category}`);
  if (t.business) bits.push(`negocio: ${t.business}`);
  bits.push(`id: ${t.id}`);
  return bits.join(" · ");
}

export const PERIODS = ["hoy", "ayer", "semana", "semana_pasada", "mes", "mes_pasado", "ultimos_30", "trimestre", "año", "año_pasado", "todo"] as const;
export type PeriodName = (typeof PERIODS)[number];
export type Range = { from: string; to: string; label: string };

/** Periodo por nombre (semana desde el lunes) o desde/hasta en cualquier formato que entienda `parseDay`. */
export function periodRange(o: { periodo?: PeriodName; desde?: string | null; hasta?: string | null }, today: string, fallback: PeriodName = "mes"): Range | null {
  if (o.desde || o.hasta) {
    const from = o.desde ? parseDay(o.desde, today) : "2000-01-01";
    const to = o.hasta ? parseDay(o.hasta, today) : today;
    if (!from || !to) return null;
    return from <= to ? { from, to, label: `del ${formatDate(from)} al ${formatDate(to)}` } : { from: to, to: from, label: `del ${formatDate(to)} al ${formatDate(from)}` };
  }
  const week = startOfWeek(today), month = startOfMonth(today), year = `${today.slice(0, 4)}-01-01`;
  switch (o.periodo ?? fallback) {
    case "hoy": return { from: today, to: today, label: "hoy" };
    case "ayer": { const d = addDays(today, -1); return { from: d, to: d, label: "ayer" }; }
    case "semana": return { from: week, to: today, label: "esta semana" };
    case "semana_pasada": return { from: addDays(week, -7), to: addDays(week, -1), label: "la semana pasada" };
    case "mes": return { from: month, to: today, label: "este mes" };
    case "mes_pasado": { const f = addMonths(month, -1); return { from: f, to: endOfMonth(f), label: "el mes pasado" }; }
    case "ultimos_30": return { from: addDays(today, -29), to: today, label: "los últimos 30 días" };
    case "trimestre": return { from: addMonths(month, -2), to: today, label: "los últimos 3 meses" };
    case "año": return { from: year, to: today, label: "este año" };
    case "año_pasado": { const y = String(Number(today.slice(0, 4)) - 1); return { from: `${y}-01-01`, to: `${y}-12-31`, label: `el año ${y}` }; }
    case "todo": return { from: "2000-01-01", to: today, label: "desde siempre" };
  }
}

/** Periodo anterior de la misma duración (para comparar). */
export function previousRange(r: Range): Range {
  const days = diffDays(r.from, r.to) + 1;
  const to = addDays(r.from, -1), from = addDays(to, -(days - 1));
  return { from, to, label: "el periodo anterior" };
}

/** «+12 %» / «−3 %» / «nuevo» frente al periodo anterior. */
export function changeText(now: number, before: number): string {
  if (!before) return now ? "nuevo" : "=";
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)} %`;
}

/**
 * Recurrencias sobre fechas ISO "AAAA-MM-DD" (aritmética en UTC, sin horario de verano).
 * Semana desde lunes: byweekday 0 = lunes … 6 = domingo.
 */
import { addDays, addMonths, diffDays, isValidISO, startOfWeek } from "@/lib/dates";

export type Freq = "daily" | "weekly" | "monthly" | "yearly";
export type Recurrence = { freq: Freq; interval: number; byweekday?: number[]; until?: string };

const WEEKDAYS_SHORT = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
export const WEEKDAYS_LONG = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** Valida y normaliza una recurrencia venida de la base de datos o de un formulario. */
export function parseRecurrence(input: unknown): Recurrence | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  if (r.freq !== "daily" && r.freq !== "weekly" && r.freq !== "monthly" && r.freq !== "yearly") return null;
  const interval = Number.isInteger(r.interval) ? (r.interval as number) : 1;
  if (interval < 1 || interval > 365) return null;
  const out: Recurrence = { freq: r.freq, interval };
  if (r.freq === "weekly" && Array.isArray(r.byweekday)) {
    const days = [...new Set((r.byweekday as unknown[]).filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort();
    if (days.length > 0) out.byweekday = days;
  }
  if (typeof r.until === "string" && isValidISO(r.until)) out.until = r.until;
  return out;
}

export function dow(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Aparición n-ésima (0 = la del ancla) para daily/monthly/yearly. */
function nth(rec: Recurrence, anchor: string, n: number): string {
  switch (rec.freq) {
    case "daily": return addDays(anchor, n * rec.interval);
    case "monthly": return addMonths(anchor, n * rec.interval);
    case "yearly": return addMonths(anchor, n * rec.interval * 12);
    default: throw new Error("nth no aplica a weekly");
  }
}

/**
 * Apariciones de la serie que empieza en `anchor` dentro de [from, to] (ambos incluidos).
 * Máximo `limit` resultados (protección).
 */
export function occurrencesBetween(rec: Recurrence, anchor: string, from: string, to: string, limit = 1000): string[] {
  const out: string[] = [];
  const end = rec.until && rec.until < to ? rec.until : to;
  if (end < from || end < anchor) return out;
  const push = (d: string) => { if (d >= from && d <= end && d >= anchor) out.push(d); };

  if (rec.freq === "weekly") {
    const days = rec.byweekday?.length ? rec.byweekday : [dow(anchor)];
    const week0 = startOfWeek(anchor);
    // Primera semana que puede tocar el rango.
    const first = Math.max(0, Math.floor(diffDays(week0, startOfWeek(from > anchor ? from : anchor)) / 7 / rec.interval));
    for (let k = first; out.length < limit; k++) {
      const weekStart = addDays(week0, k * rec.interval * 7);
      if (weekStart > end) break;
      for (const d of days) push(addDays(weekStart, d));
    }
    return out.sort();
  }

  // daily / monthly / yearly: se avanza desde el ancla (no encadenando, para no derivar el 31 → 28).
  let n = 0;
  if (rec.freq === "daily") n = Math.max(0, Math.floor(diffDays(anchor, from) / rec.interval) - 1);
  for (; out.length < limit; n++) {
    const d = nth(rec, anchor, n);
    if (d > end) break;
    push(d);
    if (n > 100_000) break;
  }
  return out;
}

/** Siguiente aparición estrictamente posterior a `after` (o null si la serie terminó). */
export function nextOccurrence(rec: Recurrence, anchor: string, after: string): string | null {
  const horizon = rec.freq === "yearly" ? 366 * 10 : rec.freq === "monthly" ? 366 * 3 : 366 * 2;
  const next = addDays(after, 1);
  const from = next > anchor ? next : anchor;
  const found = occurrencesBetween(rec, anchor, from, addDays(from, horizon), 1);
  return found[0] ?? null;
}

export function describeRecurrence(rec: Recurrence): string {
  const n = rec.interval;
  let text: string;
  switch (rec.freq) {
    case "daily": text = n === 1 ? "Cada día" : `Cada ${n} días`; break;
    case "weekly": {
      const base = n === 1 ? "Cada semana" : `Cada ${n} semanas`;
      text = rec.byweekday?.length ? `${base} (${rec.byweekday.map((d) => WEEKDAYS_SHORT[d]).join(", ")})` : base;
      break;
    }
    case "monthly": text = n === 1 ? "Cada mes" : `Cada ${n} meses`; break;
    case "yearly": text = n === 1 ? "Cada año" : `Cada ${n} años`; break;
  }
  return rec.until ? `${text} hasta ${rec.until.split("-").reverse().join("/")}` : text;
}

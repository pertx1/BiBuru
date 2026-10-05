/**
 * Fechas contables como texto ISO "AAAA-MM-DD" (sin hora ni zona), para evitar
 * desfases. Aritmética en UTC: determinista y sin saltos de horario de verano.
 * La zona (Europe/Madrid) solo interviene al decidir qué día es "hoy".
 */
export const TIMEZONE = "Europe/Madrid";

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUTC(iso: string): Date {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Fecha ISO inválida: ${iso}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}
function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isValidISO(iso: string): boolean {
  const m = ISO_RE.exec(iso);
  if (!m) return false;
  const d = toUTC(iso);
  return fromUTC(d) === iso;
}

/** Día actual en la zona indicada, "AAAA-MM-DD". */
export function todayISO(now: Date = new Date(), timeZone: string = TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "2026-03-05" -> "05/03/2026" */
export function formatDate(iso: string): string {
  const m = ISO_RE.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Acepta "05/03/2026", "5/3/26", "5-3-2026" o ISO. Devuelve ISO o null. */
export function parseDateInput(input: string): string | null {
  const s = input.trim();
  if (isValidISO(s)) return s;
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(s);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  const iso = `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isValidISO(iso) ? iso : null;
}

export function addDays(iso: string, days: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

/** Suma meses sin desbordar: 31 ene + 1 mes = 28/29 feb. */
export function addMonths(iso: string, months: number): string {
  const d = toUTC(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return fromUTC(d);
}

export function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + "01";
}
export function endOfMonth(iso: string): string {
  const d = toUTC(iso);
  return fromUTC(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}
/** Lunes de la semana de `iso` (la semana empieza en lunes). */
export function startOfWeek(iso: string): string {
  const dow = (toUTC(iso).getUTCDay() + 6) % 7; // lunes = 0
  return addDays(iso, -dow);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

export type PeriodPreset = "this_month" | "last_month" | "last_30" | "last_3_months" | "this_year" | "last_year" | "custom";

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  this_month: "Este mes",
  last_month: "Mes pasado",
  last_30: "Últimos 30 días",
  last_3_months: "Últimos 3 meses",
  this_year: "Este año",
  last_year: "Año pasado",
  custom: "Personalizado",
};

export type Period = { from: string; to: string };

export function resolvePeriod(preset: PeriodPreset, today: string, custom?: Period): Period {
  switch (preset) {
    case "this_month":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "last_month": {
      const prev = addMonths(startOfMonth(today), -1);
      return { from: prev, to: endOfMonth(prev) };
    }
    case "last_30":
      return { from: addDays(today, -29), to: today };
    case "last_3_months":
      return { from: startOfMonth(addMonths(today, -2)), to: endOfMonth(today) };
    case "this_year":
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case "last_year": {
      const y = +today.slice(0, 4) - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    case "custom":
      if (custom && isValidISO(custom.from) && isValidISO(custom.to) && custom.from <= custom.to) return custom;
      return resolvePeriod("this_month", today);
  }
}

/**
 * Periodo inmediatamente anterior para comparar. Si el rango son meses
 * completos, es el mismo número de meses antes; si no, el mismo número de días.
 */
export function previousPeriod(p: Period): Period {
  const wholeMonths = p.from === startOfMonth(p.from) && p.to === endOfMonth(p.to);
  if (wholeMonths) {
    const n = (+p.to.slice(0, 4) - +p.from.slice(0, 4)) * 12 + (+p.to.slice(5, 7) - +p.from.slice(5, 7)) + 1;
    const from = addMonths(p.from, -n);
    return { from, to: endOfMonth(addMonths(p.from, -1)) };
  }
  const len = diffDays(p.from, p.to) + 1;
  return { from: addDays(p.from, -len), to: addDays(p.from, -1) };
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function monthLabel(iso: string, withYear = true): string {
  const m = MONTHS[+iso.slice(5, 7) - 1];
  return withYear ? `${m} ${iso.slice(2, 4)}` : m;
}

/** Fecha y hora actuales ("AAAA-MM-DD", "HH:MM") en la zona indicada. */
export function nowLocal(now: Date = new Date(), timeZone: string = TIMEZONE): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  return { date: todayISO(now, timeZone), time: parts };
}

/** Desfase (minutos) de `timeZone` respecto a UTC en el instante `at` (positivo al este). */
function tzOffsetMinutes(at: Date, timeZone: string): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(at).reduce<Record<string, number>>((a, x) => { if (x.type !== "literal") a[x.type] = +x.value; return a; }, {});
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUTC - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/**
 * Hora "de pared" local (fecha + HH:MM en `timeZone`) -> instante UTC. Resuelve el cambio de hora:
 * una hora inexistente (salto de primavera) se lleva a la siguiente; una repetida (otoño) usa la primera.
 */
export function zonedToUtc(date: string, time: string, timeZone: string = TIMEZONE): Date {
  const [h, m] = time.split(":").map(Number);
  const guess = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h, m);
  // Desfases posibles ese día (antes y después de un posible cambio de hora).
  const offsets = [...new Set([tzOffsetMinutes(new Date(guess - 86_400_000), timeZone), tzOffsetMinutes(new Date(guess + 86_400_000), timeZone)])];
  const valid = offsets
    .map((o) => guess - o * 60_000)
    .filter((t) => { const l = nowLocal(new Date(t), timeZone); return l.date === date && l.time === time.slice(0, 5); });
  if (valid.length > 0) return new Date(Math.min(...valid)); // otoño: hora repetida -> la primera
  return new Date(guess - Math.min(...offsets) * 60_000);    // primavera: hora inexistente -> la siguiente válida
}

/**
 * Revisión diaria, semanal y mensual: qué periodo cubre cada una y cuándo toca generarla (lógica pura, con tests).
 * Fechas «de pared» (date ISO) en la zona del perfil, como el resto de avisos.
 */
import { addDays, addMonths, endOfMonth, startOfMonth, startOfWeek } from "@/lib/dates";

export type ReviewKind = "diaria" | "semanal" | "mensual";
export const REVIEW_KINDS: ReviewKind[] = ["diaria", "semanal", "mensual"];
export const REVIEW_LABEL: Record<ReviewKind, string> = { diaria: "Diaria", semanal: "Semanal", mensual: "Mensual" };

export type Range = { from: string; to: string };
export type ReviewPeriod = {
  kind: ReviewKind;
  start: string; end: string;   // lo que se revisa (clave del histórico: start)
  previous: Range;              // para comparar
  ahead: Range;                 // eventos que vienen
};

export type ReviewPrefs = {
  review_daily_enabled: boolean; review_daily_time: string;
  review_weekly_enabled: boolean; review_weekly_dow: number; review_weekly_time: string;
  review_monthly_enabled: boolean; review_monthly_time: string;
};

/** Día de la semana con 0 = lunes. */
export const dow = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

/**
 * Periodo de la revisión que toca el día `today`.
 * - Diaria: hoy (con lo de ayer y lo que llevas de mes).
 * - Semanal: de lunes a domingo. Si se hace de viernes a domingo, la semana actual; si no (p. ej. el lunes), la anterior.
 * - Mensual: el mes anterior completo (se hace el día 1); los eventos, del mes que empieza.
 */
export function reviewPeriod(kind: ReviewKind, today: string): ReviewPeriod {
  if (kind === "diaria") {
    return { kind, start: today, end: today, previous: { from: addDays(today, -1), to: addDays(today, -1) }, ahead: { from: today, to: addDays(today, 1) } };
  }
  if (kind === "semanal") {
    const thisMonday = startOfWeek(today);
    const start = dow(today) >= 4 ? thisMonday : addDays(thisMonday, -7);
    const end = addDays(start, 6);
    return { kind, start, end, previous: { from: addDays(start, -7), to: addDays(start, -1) }, ahead: { from: addDays(end, 1), to: addDays(end, 7) } };
  }
  const start = startOfMonth(addMonths(today, -1));
  const prevStart = startOfMonth(addMonths(today, -2));
  return { kind, start, end: endOfMonth(start), previous: { from: prevStart, to: endOfMonth(prevStart) }, ahead: { from: startOfMonth(today), to: endOfMonth(today) } };
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * ¿Toca generar esta revisión ahora? Desde su hora y durante el resto del día (si el cron o el móvil estuvieron parados,
 * se genera en cuanto vuelven). La mensual también los días 2 y 3 si el día 1 no se pudo.
 */
export function isDue(kind: ReviewKind, prefs: ReviewPrefs, now: { date: string; time: string }): boolean {
  const reached = (t: string) => minutes(now.time) >= minutes(t);
  if (kind === "diaria") return prefs.review_daily_enabled && reached(prefs.review_daily_time);
  if (kind === "semanal") return prefs.review_weekly_enabled && dow(now.date) === prefs.review_weekly_dow && reached(prefs.review_weekly_time);
  const day = Number(now.date.slice(8, 10));
  return prefs.review_monthly_enabled && (day > 1 && day <= 3 || day === 1 && reached(prefs.review_monthly_time));
}

/** Clave del aviso (una vez por revisión). */
export const reviewPushKey = (kind: ReviewKind, start: string) => `review:${kind}:${start}`;

/** Texto corto del periodo: «hoy», «semana del 5 al 11 de octubre», «septiembre de 2026». */
export function periodLabel(p: Pick<ReviewPeriod, "kind" | "start" | "end">): string {
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const d = (iso: string) => Number(iso.slice(8, 10));
  const m = (iso: string) => months[Number(iso.slice(5, 7)) - 1];
  if (p.kind === "diaria") return `${d(p.start)} de ${m(p.start)}`;
  if (p.kind === "semanal") return m(p.start) === m(p.end) ? `semana del ${d(p.start)} al ${d(p.end)} de ${m(p.end)}` : `semana del ${d(p.start)} de ${m(p.start)} al ${d(p.end)} de ${m(p.end)}`;
  return `${m(p.start)} de ${p.start.slice(0, 4)}`;
}

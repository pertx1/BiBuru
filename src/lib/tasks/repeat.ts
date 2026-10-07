/**
 * Repetición de tareas como en Antola: cada día, días concretos, cada semana o cada mes. Funciones puras sobre
 * fechas ISO (sin horas ni zonas). Los días de la semana van con 0 = domingo (como `Date.getUTCDay`).
 * La repetición de eventos del calendario sigue en `recurrence.ts` (jsonb, más completa).
 */
import { addDays } from "@/lib/dates";

export const REPEATS = ["none", "daily", "weekdays", "weekly", "monthly"] as const;
export type Repeat = (typeof REPEATS)[number];

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: "No se repite",
  daily: "Cada día",
  weekdays: "Días concretos",
  weekly: "Cada semana",
  monthly: "Cada mes",
};

/** Botones de días en orden español (L a D) con su número (0 = domingo). */
export const WEEKDAY_BUTTONS: { day: number; short: string; name: string }[] = [
  { day: 1, short: "L", name: "lunes" }, { day: 2, short: "M", name: "martes" }, { day: 3, short: "X", name: "miércoles" },
  { day: 4, short: "J", name: "jueves" }, { day: 5, short: "V", name: "viernes" }, { day: 6, short: "S", name: "sábado" }, { day: 0, short: "D", name: "domingo" },
];

export const dayOfWeek = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Suma meses llevando el día a `monthDay` o, si el mes es más corto, a su último día (31 → 30 → 31). */
export function addMonthsClamped(iso: string, months: number, monthDay: number): string {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1 + months;
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(monthDay, last));
  return first.toISOString().slice(0, 10);
}

/** Siguiente fecha tras `from` según la regla (un solo paso). */
export function stepRecurrence(from: string, repeat: Repeat, days: number[], monthDay: number): string | null {
  switch (repeat) {
    case "daily": return addDays(from, 1);
    case "weekly": return addDays(from, 7);
    case "monthly": return addMonthsClamped(from, 1, monthDay);
    case "weekdays": {
      if (days.length === 0) return addDays(from, 1);
      for (let i = 1; i <= 7; i++) {
        const candidate = addDays(from, i);
        if (days.includes(dayOfWeek(candidate))) return candidate;
      }
      return null;
    }
    default: return null;
  }
}

/**
 * Fecha de la siguiente ocurrencia al completar una tarea repetitiva. Avanza desde su fecha hasta pasar de hoy:
 * completar tarde no deja ocurrencias atrasadas y completar antes de tiempo salta a la siguiente.
 */
export function nextOccurrence(dueDate: string, today: string, repeat: Repeat, days: number[]): string | null {
  if (repeat === "none") return null;
  const monthDay = Number(dueDate.slice(8, 10));
  let next = stepRecurrence(dueDate, repeat, days, monthDay);
  let guard = 0;
  while (next && next <= today && guard < 1000) { next = stepRecurrence(next, repeat, days, monthDay); guard++; }
  return next;
}

/**
 * Ocurrencia que toca ahora de una tarea repetitiva que no se hizo a tiempo: la última fecha de la serie que no pasa
 * de hoy («cada día» → hoy; «cada semana» → el último día de la serie, que puede seguir siendo anterior a hoy).
 * Devuelve null si la tarea ya está en su ocurrencia actual.
 */
export function currentOccurrence(dueDate: string, today: string, repeat: Repeat, days: number[]): string | null {
  if (repeat === "none" || dueDate >= today) return null;
  const monthDay = Number(dueDate.slice(8, 10));
  let current = dueDate;
  let next = stepRecurrence(current, repeat, days, monthDay);
  let guard = 0;
  while (next && next <= today && guard < 1000) { current = next; next = stepRecurrence(current, repeat, days, monthDay); guard++; }
  return current === dueDate ? null : current;
}

/** «Cada día», «L, X y V», «Cada semana (lunes)», «Cada mes (día 31)». */
export function describeRepeat(repeat: Repeat, days: number[], dueDate: string | null): string {
  if (repeat === "weekdays") {
    const names = WEEKDAY_BUTTONS.filter((b) => days.includes(b.day)).map((b) => b.short);
    return names.length ? (names.length > 1 ? `${names.slice(0, -1).join(", ")} y ${names.at(-1)}` : `Cada ${WEEKDAY_BUTTONS.find((b) => b.short === names[0])!.name}`) : REPEAT_LABEL.daily;
  }
  if (repeat === "weekly" && dueDate) return `Cada semana (${WEEKDAY_BUTTONS.find((b) => b.day === dayOfWeek(dueDate))!.name})`;
  if (repeat === "monthly" && dueDate) return `Cada mes (día ${Number(dueDate.slice(8, 10))})`;
  return REPEAT_LABEL[repeat];
}

/**
 * Lo que entiende el alta rápida («cada lunes», «cada día»…, días con 0 = lunes) → repetición de tareas.
 * Lo que no existe aquí (cada año, cada N…) se queda en la opción más cercana o sin repetir.
 */
export function repeatFromQuick(r: { freq: string; interval: number; byweekday?: number[] } | null, dueDate: string | null): { repeat: Repeat; days: number[] } {
  if (!r) return { repeat: "none", days: [] };
  if (r.freq === "daily") return { repeat: "daily", days: [] };
  if (r.freq === "monthly") return { repeat: "monthly", days: [] };
  if (r.freq === "weekly") {
    const days = [...new Set((r.byweekday ?? []).map((d) => (d + 1) % 7))].sort();
    if (days.length === 0 || (days.length === 1 && dueDate && days[0] === dayOfWeek(dueDate))) return { repeat: "weekly", days: [] };
    return { repeat: "weekdays", days };
  }
  return { repeat: "none", days: [] };
}

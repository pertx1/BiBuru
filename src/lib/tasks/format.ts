import { diffDays, formatDate } from "@/lib/dates";

const DAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const dowOf = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

/** "Hoy 10:00", "Mañana", "vie 09/10", "Atrasada (hace 3 días)". */
export function dueLabel(date: string | null, time: string | null, today: string): { text: string; overdue: boolean; today: boolean } {
  if (!date) return { text: "", overdue: false, today: false };
  const t = time ? ` ${time.slice(0, 5)}` : "";
  const d = diffDays(today, date);
  if (d < 0) return { text: `Atrasada · ${d === -1 ? "ayer" : `hace ${-d} días`}${t}`, overdue: true, today: false };
  if (d === 0) return { text: `Hoy${t}`, overdue: false, today: true };
  if (d === 1) return { text: `Mañana${t}`, overdue: false, today: false };
  if (d < 7) return { text: `${DAYS[dowOf(date)]} ${formatDate(date).slice(0, 5)}${t}`, overdue: false, today: false };
  return { text: `${formatDate(date)}${t}`, overdue: false, today: false };
}

export const PRIORITY_LABELS = ["Sin prioridad", "Baja", "Media", "Alta"] as const;
export const PRIORITY_COLORS = ["", "#3b82f6", "#f59e0b", "#ef4444"] as const;

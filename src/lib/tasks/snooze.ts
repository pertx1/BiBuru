import { addDays, startOfWeek } from "@/lib/dates";

export type SnoozeOption = "1h" | "tarde" | "manana" | "semana";
export const SNOOZE_LABELS: Record<SnoozeOption, string> = {
  "1h": "1 hora", tarde: "Esta tarde", manana: "Mañana", semana: "La semana que viene",
};

export type Due = { date: string | null; time: string | null };

/**
 * Nueva fecha/hora al posponer. `now` es la fecha y hora actuales en la zona del usuario.
 * - 1 hora: dentro de 60 minutos (con hora).
 * - Esta tarde: 17:00; si ya pasaron las 16:00, 20:00; si ya pasaron las 19:00, mañana 09:00.
 * - Mañana / semana que viene (lunes): conserva la hora que tuviera la tarea.
 */
export function snooze(option: SnoozeOption, now: { date: string; time: string }, current: Due): Due {
  const nowMin = Number(now.time.slice(0, 2)) * 60 + Number(now.time.slice(3, 5));
  const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  switch (option) {
    case "1h": {
      const total = nowMin + 60;
      return { date: addDays(now.date, Math.floor(total / 1440)), time: hm(total % 1440) };
    }
    case "tarde":
      if (nowMin < 16 * 60) return { date: now.date, time: "17:00" };
      if (nowMin < 19 * 60) return { date: now.date, time: "20:00" };
      return { date: addDays(now.date, 1), time: "09:00" };
    case "manana":
      return { date: addDays(now.date, 1), time: current.time };
    case "semana":
      return { date: addDays(startOfWeek(now.date), 7), time: current.time };
  }
}

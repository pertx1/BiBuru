import { addDays, diffDays } from "@/lib/dates";
import { occurrencesBetween, parseRecurrence } from "./recurrence";

export type EventRow = {
  id: string; title: string; notes: string | null; location: string | null; all_day: boolean;
  start_date: string; start_time: string | null; end_date: string; end_time: string | null;
  recurrence: unknown; business_id: string | null;
};
export type TaskCalRow = { id: string; title: string; due_date: string | null; due_time: string | null; business_id: string | null; priority: number; status: string };

export type CalItem = {
  key: string; kind: "event" | "task"; id: string; title: string;
  date: string; endDate: string; startTime: string | null; endTime: string | null; allDay: boolean;
  businessId: string | null; location: string | null; recurring: boolean; done: boolean; priority: number;
};

const hm = (t: string | null) => (t ? t.slice(0, 5) : null);

/** Apariciones de los eventos (incluidos los recurrentes) que tocan el rango [from, to]. */
export function expandEvents(events: EventRow[], from: string, to: string): CalItem[] {
  const items: CalItem[] = [];
  for (const e of events) {
    const span = Math.max(0, diffDays(e.start_date, e.end_date));
    const rec = parseRecurrence(e.recurrence);
    const starts = rec
      ? occurrencesBetween(rec, e.start_date, addDays(from, -span), to)
      : e.start_date <= to && e.end_date >= from ? [e.start_date] : [];
    for (const s of starts) {
      items.push({
        key: `e:${e.id}:${s}`, kind: "event", id: e.id, title: e.title, date: s, endDate: addDays(s, span),
        startTime: e.all_day ? null : hm(e.start_time), endTime: e.all_day ? null : hm(e.end_time), allDay: e.all_day,
        businessId: e.business_id, location: e.location, recurring: !!rec, done: false, priority: 0,
      });
    }
  }
  return items;
}

export function tasksToItems(tasks: TaskCalRow[]): CalItem[] {
  return tasks.filter((t) => t.due_date).map((t) => ({
    key: `t:${t.id}`, kind: "task" as const, id: t.id, title: t.title, date: t.due_date!, endDate: t.due_date!,
    startTime: hm(t.due_time), endTime: null, allDay: !t.due_time, businessId: t.business_id, location: null,
    recurring: false, done: t.status === "done", priority: t.priority,
  }));
}

/** Elementos que ocupan el día `day`, ordenados: todo el día primero, luego por hora. */
export function itemsForDay(items: CalItem[], day: string): CalItem[] {
  return items
    .filter((i) => i.date <= day && day <= i.endDate)
    .sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.title.localeCompare(b.title, "es"));
}

/** Minutos desde medianoche de "HH:MM". */
export const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export type Placed = { item: CalItem; top: number; height: number; lane: number; lanes: number };

/**
 * Coloca los elementos con hora de un día en una cuadrícula (minutos desde las 00:00). Los que se
 * solapan se reparten en carriles lado a lado. `minHeight` evita eventos invisibles de 0 minutos.
 */
export function layoutDay(items: CalItem[], day: string, minHeight = 30): Placed[] {
  const timed = items.filter((i) => !i.allDay && i.startTime).map((i) => {
    const start = i.date < day ? 0 : minutes(i.startTime!);
    const rawEnd = i.endDate > day ? 24 * 60 : i.endTime ? minutes(i.endTime) : start + minHeight;
    return { item: i, start, end: Math.max(rawEnd, start + minHeight) };
  }).sort((a, b) => a.start - b.start || a.end - b.end);

  const out: Placed[] = [];
  let cluster: typeof timed = [];
  let clusterEnd = -1;
  const flush = () => {
    const laneEnds: number[] = [];
    const placed = cluster.map((c) => {
      let lane = laneEnds.findIndex((e) => e <= c.start);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(c.end); } else laneEnds[lane] = c.end;
      return { c, lane };
    });
    for (const { c, lane } of placed) out.push({ item: c.item, top: c.start, height: c.end - c.start, lane, lanes: laneEnds.length });
    cluster = [];
    clusterEnd = -1;
  };
  for (const t of timed) {
    if (cluster.length && t.start >= clusterEnd) flush();
    cluster.push(t);
    clusterEnd = Math.max(clusterEnd, t.end);
  }
  if (cluster.length) flush();
  return out;
}

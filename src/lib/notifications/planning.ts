/**
 * Qué avisos toca enviar ahora. Lógica pura sobre "hora de pared" local (fecha + HH:MM en la zona del
 * usuario), sin red ni base de datos. El cron la ejecuta cada minuto; cada aviso lleva una clave de
 * deduplicación (`key`) para que reintentos y minutos sucesivos no lo envíen dos veces.
 */
import { addDays, diffDays } from "@/lib/dates";
import { occurrencesBetween, parseRecurrence } from "@/lib/tasks/recurrence";

export type Local = { date: string; time: string }; // time "HH:MM"

export type Prefs = {
  task_lead_minutes: number;
  event_lead_minutes: number;
  quiet_hours_start: string; // "HH:MM[:SS]"
  quiet_hours_end: string;
  daily_digest_enabled: boolean;
  daily_digest_time: string;
  overdue_alert_enabled: boolean;
  overdue_alert_time: string;
  weekly_review_enabled: boolean;
  weekly_review_dow: number; // 0 = lunes
  weekly_review_time: string;
  news_enabled?: boolean;
  news_time?: string;
  news_weekends?: boolean;
};

export type Push = {
  key: string;
  kind: "task" | "event" | "digest" | "overdue" | "weekly" | "news" | "mail";
  refId?: string;
  title: string;
  body: string;
  url: string;
  image?: string | null;
};

const hm = (t: string) => t.slice(0, 5);
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const stamp = (d: string, t: string) => `${d}T${hm(t)}`;

/** Suma minutos a una fecha/hora local (puede cruzar la medianoche). */
export function addMinutes(l: Local, delta: number): Local {
  const total = minutesOf(l.time) + delta;
  const days = Math.floor(total / 1440);
  const rem = ((total % 1440) + 1440) % 1440;
  return { date: addDays(l.date, days), time: `${String(Math.floor(rem / 60)).padStart(2, "0")}:${String(rem % 60).padStart(2, "0")}` };
}

/** ¿Estamos en horas de silencio? Admite tramos que cruzan la medianoche (22:00–08:00). Inicio = fin: sin silencio. */
export function inQuietHours(time: string, start: string, end: string): boolean {
  const t = minutesOf(time), s = minutesOf(start), e = minutesOf(end);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/** now es igual o posterior a `at`, y como máximo `windowMin` minutos después. */
function withinWindow(now: Local, at: Local, windowMin: number): boolean {
  const diff = diffDays(at.date, now.date) * 1440 + (minutesOf(now.time) - minutesOf(at.time));
  return diff >= 0 && diff <= windowMin;
}

const dayLabel = (d: string) => {
  const names = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const dow = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
  return `${names[dow]} ${+d.slice(8, 10)} de ${months[+d.slice(5, 7) - 1]}`;
};

export type TaskRow = { id: string; title: string; due_date: string | null; due_time: string | null; status: string; parent_id: string | null; updatedLocal: Local };

/**
 * Recordatorio de tareas con hora: se avisa `task_lead_minutes` antes (0 = a su hora).
 * - Solo si la tarea se fijó para el futuro en su última edición (no avisa de lo ya pasado al importar o editar).
 * - Si estaba en horas de silencio, se envía al terminar éstas, siempre que no hayan pasado más de 6 h.
 */
export function planTaskReminders(tasks: TaskRow[], prefs: Prefs, now: Local): Push[] {
  const out: Push[] = [];
  for (const t of tasks) {
    if (t.status !== "open" || t.parent_id || !t.due_date || !t.due_time) continue;
    const due: Local = { date: t.due_date, time: hm(t.due_time) };
    const remind = addMinutes(due, -prefs.task_lead_minutes);
    if (stamp(remind.date, remind.time) > stamp(now.date, now.time)) continue; // aún no
    if (stamp(due.date, due.time) < stamp(t.updatedLocal.date, t.updatedLocal.time)) continue; // ya estaba vencida al editarla
    if (!withinWindow(now, due, 6 * 60) && stamp(now.date, now.time) > stamp(due.date, due.time)) continue; // demasiado tarde
    const lead = prefs.task_lead_minutes;
    out.push({
      key: `task:${t.id}:${stamp(due.date, due.time)}`, kind: "task", refId: t.id,
      title: lead > 0 ? `Tarea en ${lead >= 60 ? `${Math.round(lead / 60)} h` : `${lead} min`} · ${due.time}` : `Tarea · ${due.time}`,
      body: t.title, url: `/aviso/task/${t.id}`,
    });
  }
  return out;
}

export type EventOcc = { id: string; title: string; date: string; startTime: string | null; location: string | null };

/** Recordatorio de eventos con hora, `event_lead_minutes` antes del inicio y hasta que empiezan. */
export function planEventReminders(events: EventOcc[], prefs: Prefs, now: Local): Push[] {
  const out: Push[] = [];
  for (const e of events) {
    if (!e.startTime) continue;
    const start: Local = { date: e.date, time: hm(e.startTime) };
    const remind = addMinutes(start, -prefs.event_lead_minutes);
    const nowS = stamp(now.date, now.time);
    if (stamp(remind.date, remind.time) > nowS || stamp(start.date, start.time) < nowS) continue;
    const mins = diffDays(now.date, start.date) * 1440 + minutesOf(start.time) - minutesOf(now.time);
    const when = mins <= 0 ? "ahora" : mins >= 60 ? `en ${Math.round(mins / 60)} h` : `en ${mins} min`;
    out.push({
      key: `event:${e.id}:${stamp(start.date, start.time)}`, kind: "event", refId: e.id,
      title: `${e.title} · ${when}`, body: `${start.time}${e.location ? ` · ${e.location}` : ""}`, url: `/aviso/event/${e.id}?d=${e.date}`,
    });
  }
  return out;
}

export type DigestData = {
  todayTasks: { title: string; due_time: string | null }[];
  overdueCount: number;
  todayEvents: { title: string; startTime: string | null }[];
};

/** Resumen de la mañana: tareas de hoy, eventos y atrasadas. Se envía a su hora (hasta 3 h de margen). */
export function planDailyDigest(prefs: Prefs, now: Local, data: DigestData): Push | null {
  if (!prefs.daily_digest_enabled) return null;
  if (!withinWindow(now, { date: now.date, time: hm(prefs.daily_digest_time) }, 180)) return null;
  const { todayTasks, overdueCount, todayEvents } = data;
  if (todayTasks.length + overdueCount + todayEvents.length === 0) return null;
  const lines: string[] = [];
  const parts = [
    todayTasks.length ? `${todayTasks.length} ${todayTasks.length === 1 ? "tarea" : "tareas"}` : "",
    todayEvents.length ? `${todayEvents.length} ${todayEvents.length === 1 ? "evento" : "eventos"}` : "",
  ].filter(Boolean);
  lines.push(parts.length ? `Hoy: ${parts.join(" y ")}.` : "Hoy no tienes nada con fecha.");
  const first = [...todayEvents.filter((e) => e.startTime).map((e) => ({ at: hm(e.startTime!), t: e.title })), ...todayTasks.filter((t) => t.due_time).map((t) => ({ at: hm(t.due_time!), t: t.title }))].sort((a, b) => a.at.localeCompare(b.at))[0];
  if (first) lines.push(`Primero: ${first.at} ${first.t}`);
  if (overdueCount > 0) lines.push(`${overdueCount} ${overdueCount === 1 ? "atrasada" : "atrasadas"}.`);
  return { key: `digest:${now.date}`, kind: "digest", title: `Buenos días · ${dayLabel(now.date)}`, body: lines.join("\n"), url: "/tareas?v=hoy" };
}

/** Aviso de la tarde: tareas que siguen atrasadas. */
export function planOverdueAlert(prefs: Prefs, now: Local, overdueCount: number): Push | null {
  if (!prefs.overdue_alert_enabled || overdueCount <= 0) return null;
  if (!withinWindow(now, { date: now.date, time: hm(prefs.overdue_alert_time) }, 180)) return null;
  return {
    key: `overdue:${now.date}`, kind: "overdue",
    title: overdueCount === 1 ? "Tienes 1 tarea atrasada" : `Tienes ${overdueCount} tareas atrasadas`,
    body: "Ábrelas y pospón o marca como hechas las que toque.", url: "/tareas?v=hoy",
  };
}

/** Revisión semanal de objetivos, el día y la hora elegidos. */
export function planWeeklyReview(prefs: Prefs, now: Local, activeGoals: number): Push | null {
  if (!prefs.weekly_review_enabled || activeGoals <= 0) return null;
  const dow = (new Date(`${now.date}T00:00:00Z`).getUTCDay() + 6) % 7;
  if (dow !== prefs.weekly_review_dow) return null;
  if (!withinWindow(now, { date: now.date, time: hm(prefs.weekly_review_time) }, 360)) return null;
  return {
    key: `weekly:${now.date}`, kind: "weekly", title: "Revisión semanal de objetivos",
    body: `Tienes ${activeGoals} ${activeGoals === 1 ? "objetivo activo" : "objetivos activos"}. ¿Cómo van? Actualiza el avance.`, url: "/objetivos",
  };
}

/** Eventos (incluidos los recurrentes) que empiezan en [from, to], con su fecha de aparición. */
export function eventOccurrences(
  events: { id: string; title: string; location: string | null; all_day: boolean; start_date: string; start_time: string | null; end_date: string; recurrence: unknown }[],
  from: string, to: string,
): EventOcc[] {
  const out: EventOcc[] = [];
  for (const e of events) {
    const rec = parseRecurrence(e.recurrence);
    const dates = rec ? occurrencesBetween(rec, e.start_date, from, to) : e.start_date >= from && e.start_date <= to ? [e.start_date] : [];
    for (const d of dates) out.push({ id: e.id, title: e.title, date: d, startTime: e.all_day ? null : e.start_time ? hm(e.start_time) : null, location: e.location });
  }
  return out;
}

/**
 * Aviso de noticias: a su hora (o en cuanto acaben las horas de silencio), una vez al día, solo si el resumen de hoy
 * ya está generado. Fines de semana solo si se quiere. Clave única `news:<día>` (no se envía dos veces).
 */
export function planNewsPush(prefs: Prefs, now: Local, digest: { day: string; ready: boolean; notified: boolean; title: string; body: string; image: string | null } | null): Push | null {
  if (!prefs.news_enabled || !digest || !digest.ready || digest.notified || digest.day !== now.date) return null;
  const dow = (new Date(`${now.date}T12:00:00Z`).getUTCDay() + 6) % 7;
  if (prefs.news_weekends === false && dow >= 5) return null;
  if (minutesOf(now.time) < minutesOf(hm(prefs.news_time ?? "08:00"))) return null;
  return { key: `news:${now.date}`, kind: "news", title: digest.title, body: digest.body, url: `/noticias?dia=${now.date}`, image: digest.image };
}

/** Correo nuevo (solo cuentas con el aviso activado, que viene apagado). Como mucho 3 por pasada; con más, uno agrupado. */
export function planMailPushes(msgs: { id: string; from: string | null; subject: string | null; account: string }[]): Push[] {
  if (msgs.length > 3) return [{ key: `mail:${msgs[0].id}`, kind: "mail", title: `${msgs.length} correos nuevos`, body: msgs.slice(0, 3).map((m) => m.from ?? m.account).join(", "), url: "/correo?filtro=no-leidos" }];
  return msgs.map((m) => ({ key: `mail:${m.id}`, kind: "mail" as const, refId: m.id, title: m.from ?? "Correo nuevo", body: m.subject?.trim() || "(sin asunto)", url: `/correo?abrir=${m.id}` }));
}

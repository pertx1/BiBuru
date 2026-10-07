/** Estadísticas de redes: lógica pura (probada en tests), igual para Instagram y TikTok. */
import { addDays } from "@/lib/dates";

export type DailyRow = { day: string; followers: number | null; reach: number | null; views: number | null; interactions: number | null };
export type MediaRow = { id: string; caption: string | null; permalink: string | null; thumbnail_url: string | null; posted_at: string; reach: number | null; views: number | null; interactions: number | null; likes: number | null; comments: number | null };

/** Serie diaria continua (días sin foto = null) entre from y to, ambos incluidos. */
export function dailySeries(rows: DailyRow[], from: string, to: string): DailyRow[] {
  const by = new Map(rows.map((r) => [r.day, r]));
  const out: DailyRow[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(by.get(d) ?? { day: d, followers: null, reach: null, views: null, interactions: null });
  return out;
}

const sum = (xs: (number | null)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);
const lastNonNull = (xs: (number | null)[]) => [...xs].reverse().find((x) => x != null) ?? null;
const firstNonNull = (xs: (number | null)[]) => xs.find((x) => x != null) ?? null;

/** Totales de un periodo: alcance, visualizaciones e interacciones sumadas; seguidores al final y su cambio. */
export function periodTotals(rows: DailyRow[]) {
  const f = rows.map((r) => r.followers);
  const end = lastNonNull(f), start = firstNonNull(f);
  return { reach: sum(rows.map((r) => r.reach)), views: sum(rows.map((r) => r.views)), interactions: sum(rows.map((r) => r.interactions)), followers: end, followersDelta: end != null && start != null ? end - start : null };
}

/** Variación en % frente al periodo anterior (null si no hay base). */
export const pctChange = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);

const score = (m: MediaRow) => m.interactions ?? (m.likes ?? 0) + (m.comments ?? 0);

/** Ranking de publicaciones por interacciones (o alcance si se pide). */
export function rankMedia(media: MediaRow[], by: "interactions" | "reach" | "views" = "interactions", n = 10): MediaRow[] {
  const val = (m: MediaRow) => (by === "interactions" ? score(m) : (m[by] ?? 0));
  return [...media].sort((a, b) => val(b) - val(a) || b.posted_at.localeCompare(a.posted_at)).slice(0, n);
}

const WEEKDAY = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
/** Día de la semana (0 = lunes) y hora en la zona dada. */
function localParts(iso: string, tz: string) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.find((x) => x.type === "weekday")!.value);
  return { wd, hour: Number(p.find((x) => x.type === "hour")!.value) };
}

/** Mejores días y franjas horarias: media de interacciones por publicación (mín. 2 publicaciones por grupo para fiarse). */
export function bestTimes(media: MediaRow[], tz = "Europe/Madrid") {
  const days = Array.from({ length: 7 }, (_, i) => ({ label: WEEKDAY[i], posts: 0, total: 0 }));
  const slots = [["Madrugada (0–7 h)", 0, 7], ["Mañana (7–12 h)", 7, 12], ["Mediodía (12–16 h)", 12, 16], ["Tarde (16–20 h)", 16, 20], ["Noche (20–24 h)", 20, 24]] as const;
  const hours = slots.map(([label]) => ({ label, posts: 0, total: 0 }));
  for (const m of media) {
    const { wd, hour } = localParts(m.posted_at, tz);
    days[wd].posts++; days[wd].total += score(m);
    const s = slots.findIndex(([, a, b]) => hour >= a && hour < b);
    hours[s].posts++; hours[s].total += score(m);
  }
  const fin = (xs: { label: string; posts: number; total: number }[]) => xs.map((x) => ({ ...x, avg: x.posts ? Math.round(x.total / x.posts) : 0 }));
  const pick = (xs: ReturnType<typeof fin>) => [...xs].filter((x) => x.posts >= 2).sort((a, b) => b.avg - a.avg)[0] ?? null;
  const d = fin(days), h = fin(hours);
  return { days: d, hours: h, bestDay: pick(d), bestSlot: pick(h) };
}

/** Mejor publicación de los últimos 7 días. */
export function bestOfWeek(media: MediaRow[], now = new Date()): MediaRow | null {
  const since = now.getTime() - 7 * 86400_000;
  return rankMedia(media.filter((m) => new Date(m.posted_at).getTime() >= since), "interactions", 1)[0] ?? null;
}

/** Estado de la conexión según la caducidad del token: aviso desde 7 días antes. */
export function tokenState(expiresAt: string | null, now = new Date()): "ok" | "expiring" | "expired" {
  if (!expiresAt) return "ok";
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return ms <= 0 ? "expired" : ms < 7 * 86400_000 ? "expiring" : "ok";
}

/** Reintentos de publicación: 2, 10 y 30 minutos; después, error visible. */
export const RETRY_MINUTES = [2, 10, 30];
export const nextRetry = (attempts: number, now = new Date()) => (attempts >= RETRY_MINUTES.length ? null : new Date(now.getTime() + RETRY_MINUTES[attempts] * 60_000));

/** Texto final: texto + hashtags (cada uno con #, sin repetir), recortado al máximo de la red. */
export function composeCaption(caption: string, hashtags: string, max = 2200): string {
  const tags = [...new Set(hashtags.split(/[\s,]+/).map((t) => t.replace(/^#+/, "").trim()).filter(Boolean))].map((t) => `#${t}`);
  const text = [caption.trim(), tags.join(" ")].filter(Boolean).join("\n\n");
  return text.slice(0, max);
}

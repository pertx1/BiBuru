import Link from "next/link";
import { addDays, endOfMonth, formatDate, startOfMonth, startOfWeek, zonedToUtc } from "@/lib/dates";
import { getCalendarItems, getNow } from "@/lib/tasks/data";
import { cn } from "@/lib/utils";
import { Countdown } from "../countdown";
import { WidgetCard } from "../widget-card";
import type { WidgetProps } from "../types";

const WEEK = ["L", "M", "X", "J", "V", "S", "D"];
const dayName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", timeZone: "UTC" });

/** Siguiente evento (de hoy en adelante) con cuenta atrás. */
export async function NextEventWidget({ ctx }: WidgetProps) {
  const now = await getNow();
  const items = (await getCalendarItems(ctx.today, addDays(ctx.today, 60))).filter((e) => e.kind === "event")
    .filter((e) => e.date > ctx.today || e.allDay || (e.startTime ?? "00:00") >= now.time.slice(0, 5))
    .sort((a, b) => `${a.date} ${a.allDay ? "00:00" : a.startTime}`.localeCompare(`${b.date} ${b.allDay ? "00:00" : b.startTime}`));
  const e = items[0];
  return (
    <WidgetCard title="Próximo evento" href={e ? `/calendario?v=semana&d=${e.date}` : "/calendario"}>
      {!e ? <p className="text-sm text-muted">Nada en los próximos 60 días.</p> : (
        <>
          <p className="line-clamp-2 text-lg font-bold leading-snug">{e.title}</p>
          <p className="mt-1 text-[1.4rem] font-bold text-accent">
            {e.allDay ? (e.date === ctx.today ? "hoy" : `en ${Math.round((Date.parse(e.date) - Date.parse(ctx.today)) / 86400000)} días`) : <Countdown target={zonedToUtc(e.date, e.startTime ?? "00:00", now.timezone).toISOString()} />}
          </p>
          <p className="text-xs text-muted">{e.date === ctx.today ? "Hoy" : formatDate(e.date)}{e.allDay ? " · todo el día" : ` · ${e.startTime}`}{e.location ? ` · ${e.location}` : ""}</p>
        </>
      )}
    </WidgetCard>
  );
}

/** Mini calendario del mes con un punto en los días que tienen eventos o tareas. */
export async function MonthCalendarWidget({ ctx }: WidgetProps) {
  const from = startOfMonth(ctx.today), to = endOfMonth(ctx.today);
  const items = await getCalendarItems(from, to);
  const busy = new Map<string, { ev: number; tk: number }>();
  for (const i of items) { const b = busy.get(i.date) ?? { ev: 0, tk: 0 }; if (i.kind === "event") b.ev++; else if (!i.done) b.tk++; busy.set(i.date, b); }
  const first = startOfWeek(from);
  const cells: string[] = [];
  for (let d = first; d <= to || cells.length % 7; d = addDays(d, 1)) cells.push(d);
  const title = new Date(`${from}T12:00:00Z`).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <WidgetCard title={title.charAt(0).toUpperCase() + title.slice(1)} href={`/calendario?v=mes&d=${ctx.today}`}>
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
        {WEEK.map((d) => <span key={d} className="pb-1 font-medium text-muted">{d}</span>)}
        {cells.map((d) => {
          const inMonth = d >= from && d <= to, b = busy.get(d);
          return (
            <Link key={d} href={`/calendario?v=semana&d=${d}`} aria-label={`${formatDate(d)}${b ? `: ${b.ev} eventos, ${b.tk} tareas` : ""}`}
              className={cn("mx-auto flex size-9 flex-col items-center justify-center rounded-full tabular-nums", !inMonth && "text-muted/40", d === ctx.today && "bg-accent font-bold text-accent-foreground")}>
              {+d.slice(8)}
              <span className="flex h-1 gap-0.5">{b?.ev ? <span className={cn("size-1 rounded-full", d === ctx.today ? "bg-accent-foreground" : "bg-accent")} /> : null}{b?.tk ? <span className="size-1 rounded-full bg-amber-500" /> : null}</span>
            </Link>
          );
        })}
      </div>
    </WidgetCard>
  );
}

/** Lunes a domingo: lo que hay cada día. */
export async function WeekGlanceWidget({ w, ctx }: WidgetProps) {
  const monday = startOfWeek(ctx.today);
  const items = await getCalendarItems(monday, addDays(monday, 6));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const per = w.size === "l" ? 4 : 2;
  return (
    <WidgetCard title="Esta semana" href={`/calendario?v=semana&d=${ctx.today}`}>
      <ul className="flex flex-col divide-y divide-border">
        {days.map((d) => {
          const list = items.filter((i) => i.date === d && !(i.kind === "task" && i.done)).sort((a, b) => (a.startTime ?? "99").localeCompare(b.startTime ?? "99"));
          return (
            <li key={d} className={cn("flex gap-3 py-1.5 text-sm", d < ctx.today && "opacity-50")}>
              <span className={cn("w-12 shrink-0 capitalize tabular-nums", d === ctx.today ? "font-bold text-accent" : "text-muted")}>{dayName(d)}</span>
              <span className="min-w-0 flex-1">
                {list.length === 0 ? <span className="text-muted">—</span> : list.slice(0, per).map((i) => (
                  <span key={i.key} className="flex min-w-0 items-center gap-1.5"><span className={cn("size-1.5 shrink-0 rounded-full", i.kind === "event" ? "bg-accent" : "bg-amber-500")} /><span className="truncate">{i.startTime && !i.allDay ? `${i.startTime} ` : ""}{i.title}</span></span>
                ))}
                {list.length > per && <span className="text-xs text-muted">y {list.length - per} más</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}

import Link from "next/link";
import { Bell, CalendarDays, Inbox, Video } from "lucide-react";
import { HomeCapture } from "@/components/capture/home-capture";
import { TaskList } from "@/components/tasks/task-list";
import { getContext } from "@/lib/context";
import { formatDuration } from "@/lib/favorites/url";
import { countInbox, listInbox } from "@/lib/notes/data";
import { formatGoalValue, progressPct } from "@/lib/tasks/goals";
import { nowLocal } from "@/lib/dates";
import { getCalendarItems, getNow, goalLike, listGoals, listReminders, listTasks } from "@/lib/tasks/data";
import { groupTasks } from "@/lib/tasks/groups";
import { WidgetCard } from "../widget-card";
import { businessOf, type WidgetProps } from "../types";

/** Tareas de hoy y atrasadas; se marcan desde aquí (reutiliza la lista de Tareas). */
export async function TasksTodayWidget({ w, ctx }: WidgetProps) {
  const [tasks, goals] = await Promise.all([listTasks("hoy"), listGoals({ status: "active" })]);
  const biz = new Map(ctx.businesses.map((b) => [b.id, b.name]));
  const max = w.size === "l" ? 12 : 6;
  const groups = groupTasks("hoy", tasks, ctx.today, biz).map((g) => ({ ...g, tasks: g.tasks.slice(0, max) }));
  return (
    <WidgetCard title="Tareas de hoy" href="/tareas">
      <TaskList groups={groups} businesses={ctx.businesses} goals={goals.map((g) => ({ id: g.id, title: g.title }))} today={ctx.today} emptyText="Nada pendiente para hoy. 🎉" />
    </WidgetCard>
  );
}

/** Eventos y recordatorios de hoy, por hora. */
export async function AgendaTodayWidget({ w, ctx }: WidgetProps) {
  const [cal, reminders, now] = await Promise.all([getCalendarItems(ctx.today, ctx.today), listReminders(), getNow()]);
  const items = [
    ...cal.filter((e) => e.kind === "event").map((e) => ({ key: e.key, title: e.title, time: e.allDay ? "" : (e.startTime ?? ""), label: e.allDay ? "Todo el día" : `${e.startTime}${e.endTime ? `–${e.endTime}` : ""}`, reminder: false })),
    ...reminders.map((r) => ({ r, local: nowLocal(new Date(r.remind_at), now.timezone) })).filter((x) => x.local.date === ctx.today)
      .map(({ r, local }) => ({ key: `r-${r.id}`, title: r.title, time: local.time, label: `Aviso ${local.time.slice(0, 5)}`, reminder: true })),
  ].sort((a, b) => a.time.localeCompare(b.time));
  const shown = items.slice(0, w.size === "s" ? 3 : 6);
  return (
    <WidgetCard title="Agenda de hoy" href={`/calendario?v=agenda&d=${ctx.today}`}>
      {shown.length === 0 ? <p className="text-sm text-muted">Nada en la agenda de hoy.</p> : (
        <ul className="flex flex-col gap-2">
          {shown.map((e) => (
            <li key={e.key} className="flex min-w-0 gap-2 text-sm">
              {e.reminder ? <Bell className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden /> : <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />}
              <span className="min-w-0"><span className="block truncate font-medium">{e.title}</span><span className="text-xs tabular-nums text-muted">{e.label}</span></span>
            </li>
          ))}
          {items.length > shown.length && <li className="text-xs text-muted">y {items.length - shown.length} más</li>}
        </ul>
      )}
    </WidgetCard>
  );
}

/** Campo de captura rápida (abre la captura de siempre, con voz). */
export function QuickCaptureWidget() {
  return <HomeCapture />;
}

/** Objetivos activos con su barra. */
export async function GoalsActiveWidget({ w, ctx }: WidgetProps) {
  const biz = businessOf(w, ctx);
  const goals = (await listGoals({ status: "active", businessId: biz?.id })).slice(0, w.size === "l" ? 8 : 4);
  return (
    <WidgetCard title={`Objetivos activos${biz ? ` · ${biz.name}` : ""}`} href="/objetivos">
      {goals.length === 0 ? <p className="text-sm text-muted">No hay objetivos activos.</p> : (
        <ul className="flex flex-col gap-3">
          {goals.map((g) => {
            const p = progressPct(goalLike(g), g.live);
            const color = ctx.businesses.find((b) => b.id === g.business_id)?.color ?? "var(--accent)";
            return (
              <li key={g.id}>
                <Link href={`/objetivos/${g.id}`} className="block">
                  <div className="flex items-baseline justify-between gap-2 text-sm"><span className="truncate font-medium">{g.title}</span><span className="shrink-0 font-semibold tabular-nums">{Math.round(p.pct).toLocaleString("es-ES")} %</span></div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(p.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={g.title}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, p.pct)}%`, background: color }} />
                  </div>
                  <p className="mt-1 text-xs tabular-nums text-muted">{g.measure_type === "milestones" ? `${g.live.milestonesDone ?? 0} de ${g.live.milestonesTotal ?? 0} hitos` : `${formatGoalValue(g.measure_type as never, p.value)} de ${formatGoalValue(g.measure_type as never, p.target)}`}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}

/** Capturas pendientes de revisar. */
export async function InboxWidget({ w }: WidgetProps) {
  const [count, items] = await Promise.all([countInbox(), w.size === "m" ? listInbox("open") : Promise.resolve([])]);
  return (
    <WidgetCard title="Bandeja de entrada" href="/bandeja">
      <p className="flex items-center gap-2"><Inbox className="size-5 text-accent" aria-hidden /><span className="text-[1.65rem] font-bold tabular-nums">{count}</span></p>
      <p className="text-xs text-muted">{count === 1 ? "captura por revisar" : "capturas por revisar"}</p>
      {items.length > 0 && <ul className="mt-2 flex flex-col gap-1 text-sm">{items.slice(0, 3).map((i) => <li key={i.id} className="truncate">{i.raw_text}</li>)}</ul>}
    </WidgetCard>
  );
}

/** Últimos vídeos guardados sin ver. */
export async function VideosToWatchWidget({ w }: WidgetProps) {
  const { supabase, workspaceId } = await getContext();
  const { data, count } = await supabase.from("saved_videos").select("id, title, thumbnail_url, duration_sec", { count: "exact" })
    .eq("workspace_id", workspaceId).eq("status", "por_ver").order("created_at", { ascending: false }).limit(w.size === "m" ? 4 : 2);
  return (
    <WidgetCard title="Vídeos por ver" href="/favoritos">
      <p className="flex items-center gap-2"><Video className="size-5 text-accent" aria-hidden /><span className="text-[1.65rem] font-bold tabular-nums">{count ?? 0}</span></p>
      <ul className="mt-2 flex flex-col gap-2">
        {(data ?? []).map((v) => (
          <li key={v.id}>
            <Link href={`/favoritos?abrir=${v.id}`} className="flex min-w-0 items-center gap-2 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- miniatura externa pequeña */}
              {v.thumbnail_url ? <img src={v.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-9 w-14 shrink-0 rounded-md object-cover" /> : <span className="h-9 w-14 shrink-0 rounded-md bg-surface-2" />}
              <span className="min-w-0"><span className="line-clamp-2 leading-snug">{v.title}</span>{v.duration_sec ? <span className="text-xs text-muted">{formatDuration(v.duration_sec)}</span> : null}</span>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

import Link from "next/link";
import { CalendarDays, Inbox, Video } from "lucide-react";
import { BudgetBanner } from "@/components/ai/budget-banner";
import { GoalCard } from "@/components/goals/goal-card";
import { HomeCapture } from "@/components/capture/home-capture";
import { PageHeader } from "@/components/layout/page-header";
import { ReminderList } from "@/components/notifications/reminder-list";
import { TaskList } from "@/components/tasks/task-list";
import { getContext } from "@/lib/context";
import { getTotalsWithPrevious, listBusinesses } from "@/lib/data";
import { nowLocal, resolvePeriod } from "@/lib/dates";
import { formatEUR, variationPct } from "@/lib/money";
import { countInbox } from "@/lib/notes/data";
import { getCalendarItems, getNow, listGoals, listReminders, listTasks } from "@/lib/tasks/data";
import { groupTasks } from "@/lib/tasks/groups";

export const metadata = { title: "Inicio" };

function Section({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between"><h2 className="text-sm font-semibold">{title}</h2>{href && <Link href={href} className="text-xs text-muted underline underline-offset-2">Ver todo</Link>}</div>
      {children}
    </section>
  );
}

export default async function HomePage() {
  const { supabase, workspaceId, displayName } = await getContext();
  const now = await getNow();
  const period = resolvePeriod("this_month", now.date);
  const [tasks, businesses, goals, reminders, events, inbox, unseen, totals] = await Promise.all([
    listTasks("hoy"), listBusinesses(), listGoals({ status: "active" }), listReminders(), getCalendarItems(now.date, now.date), countInbox().catch(() => 0),
    supabase.from("saved_videos").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "por_ver").eq("analysis_status", "ready"),
    getTotalsWithPrevious(period),
  ]);
  const biz = new Map(businesses.map((b) => [b.id, b.name]));
  const bizOptions = businesses.map((b) => ({ id: b.id, name: b.name, color: b.color }));
  const goalOptions = goals.map((g) => ({ id: g.id, title: g.title }));
  const todayEvents = events.filter((e) => e.kind === "event").sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  const videos = unseen.count ?? 0;
  const groups = groupTasks("hoy", tasks, now.date, biz).map((g) => ({ ...g, tasks: g.tasks.slice(0, 8) }));
  const upcoming = reminders.filter((r) => nowLocal(new Date(r.remind_at), now.timezone).date === now.date);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={displayName ? `Hola, ${displayName}` : "Inicio"} subtitle="Qué tienes que hacer hoy y cómo van tus negocios." />
      <BudgetBanner />
      <HomeCapture />

      {(inbox > 0 || videos > 0) && (
        <div className="flex flex-wrap gap-2">
          {inbox > 0 && <Link href="/bandeja" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm hover:bg-surface-2"><Inbox className="size-4 text-accent" aria-hidden /> {inbox} {inbox === 1 ? "captura" : "capturas"} por revisar</Link>}
          {videos > 0 && <Link href="/favoritos" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm hover:bg-surface-2"><Video className="size-4 text-accent" aria-hidden /> {videos} {videos === 1 ? "vídeo" : "vídeos"} sin revisar</Link>}
        </div>
      )}

      <Section title="Hoy" href="/tareas">
        {upcoming.length > 0 && <ReminderList today={now.date} reminders={upcoming.map((r) => ({ id: r.id, title: r.title, status: r.status, local: nowLocal(new Date(r.remind_at), now.timezone) }))} />}
        {todayEvents.length > 0 && (
          <ul className="mb-3 flex flex-col gap-1.5">
            {todayEvents.map((e) => (
              <li key={e.key}><Link href={`/calendario?v=semana&d=${e.date}`} className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-surface px-3 text-sm hover:bg-surface-2">
                <CalendarDays className="size-4 shrink-0 text-accent" aria-hidden /><span className="w-24 shrink-0 tabular-nums text-muted">{e.allDay ? "Todo el día" : `${e.startTime}${e.endTime ? `–${e.endTime}` : ""}`}</span><span className="min-w-0 truncate">{e.title}</span>
              </Link></li>
            ))}
          </ul>
        )}
        <TaskList groups={groups} businesses={bizOptions} goals={goalOptions} today={now.date} emptyText="Nada pendiente para hoy. 🎉" />
      </Section>

      {businesses.length > 0 && (
        <Section title="Negocios este mes" href="/negocios">
          <ul className="grid gap-3 sm:grid-cols-2">
            {businesses.map((b) => {
              const cur = totals.byBusiness.get(b.id) ?? { income: 0, expense: 0, profit: 0, orders: 0 };
              const prev = totals.previousByBusiness.get(b.id) ?? { income: 0, expense: 0, profit: 0, orders: 0 };
              const v = variationPct(cur.profit, prev.profit);
              return (
                <li key={b.id}><Link href={`/negocios/${b.id}`} className="block rounded-xl border border-border border-l-4 bg-surface p-4 hover:bg-surface-2" style={{ borderLeftColor: b.color }}>
                  <p className="truncate font-semibold">{b.name}</p>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div><dt className="text-xs text-muted">Ingresos</dt><dd className="font-medium tabular-nums">{formatEUR(cur.income)}</dd></div>
                    <div><dt className="text-xs text-muted">Gastos</dt><dd className="font-medium tabular-nums">{formatEUR(cur.expense)}</dd></div>
                    <div><dt className="text-xs text-muted">Beneficio</dt><dd className="font-semibold tabular-nums">{formatEUR(cur.profit)}</dd>
                      {v !== null && <dd className={`text-xs ${v >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-danger"}`}>{v > 0 ? "+" : ""}{v.toLocaleString("es-ES")} %</dd>}</div>
                  </dl>
                </Link></li>
              );
            })}
          </ul>
        </Section>
      )}

      {goals.length > 0 && (
        <Section title="Objetivos" href="/objetivos">
          <div className="grid gap-3 sm:grid-cols-2">{goals.slice(0, 4).map((g) => { const b = g.business_id ? businesses.find((x) => x.id === g.business_id) : undefined; return <GoalCard key={g.id} goal={g} today={now.date} businessName={b?.name} businessColor={b?.color} />; })}</div>
        </Section>
      )}
    </div>
  );
}

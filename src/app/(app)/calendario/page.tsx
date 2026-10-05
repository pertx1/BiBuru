import { CalendarClient, type CalView } from "@/components/calendar/calendar-client";
import { PageHeader } from "@/components/layout/page-header";
import { listBusinesses } from "@/lib/data";
import { addDays, endOfMonth, isValidISO, startOfMonth, startOfWeek } from "@/lib/dates";
import { getCalendarItems, getNow, listGoals } from "@/lib/tasks/data";
import { getContext } from "@/lib/context";

export const metadata = { title: "Calendario" };

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ v?: string; d?: string }> }) {
  const sp = await searchParams;
  const now = await getNow();
  const view: CalView = sp.v === "semana" || sp.v === "agenda" ? sp.v : "mes";
  const focus = sp.d && isValidISO(sp.d) ? sp.d : now.date;
  const [from, to] =
    view === "mes" ? [startOfWeek(startOfMonth(focus)), addDays(startOfWeek(endOfMonth(focus)), 6)]
    : view === "semana" ? [startOfWeek(focus), addDays(startOfWeek(focus), 6)]
    : [focus, addDays(focus, 29)];

  const { supabase, workspaceId } = await getContext();
  const [items, businesses, goals, events] = await Promise.all([
    getCalendarItems(from, to),
    listBusinesses(),
    listGoals({ status: "active" }),
    supabase.from("events").select("*").eq("workspace_id", workspaceId).lte("start_date", to).or(`end_date.gte.${from},recurrence.not.is.null`).limit(2000),
  ]);
  return (
    <>
      <PageHeader title="Calendario" subtitle="Eventos y tareas con fecha. Toca un día para añadir algo." />
      <CalendarClient view={view} focus={focus} today={now.date} items={items} events={events.data ?? []} goals={goals.map((g) => ({ id: g.id, title: g.title }))}
        businesses={businesses.map((b) => ({ id: b.id, name: b.name, color: b.color }))} />
    </>
  );
}

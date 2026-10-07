import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BusinessIcon } from "@/components/businesses/business-icon";
import { PageHeader } from "@/components/layout/page-header";
import { ReminderList } from "@/components/notifications/reminder-list";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskList } from "@/components/tasks/task-list";
import { listBusinesses } from "@/lib/data";
import { nowLocal } from "@/lib/dates";
import { syncAllStockTasks } from "@/lib/stock/service";
import { countTaskInbox, getNow, listReminders, listTasks, TASK_VIEWS, type TaskView } from "@/lib/tasks/data";
import { groupTasks } from "@/lib/tasks/groups";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tareas" };

const LABELS: Record<TaskView, string> = { hoy: "Hoy", semana: "Próximos 7 días", bandeja: "Bandeja", sinfecha: "Sin fecha", hechas: "Completadas", todas: "Pendientes" };
const EMPTY: Record<TaskView, { title: string; text?: string }> = {
  hoy: { title: "Nada pendiente para hoy", text: "Disfruta del día o adelanta algo de la semana." },
  semana: { title: "Semana despejada", text: "No hay nada con fecha en los próximos 7 días." },
  bandeja: { title: "Bandeja vacía", text: "Lo que apuntes con «+» sin fecha ni proyecto aparecerá aquí." },
  sinfecha: { title: "Todo tiene fecha", text: "Las tareas sin fecha aparecerán aquí." },
  hechas: { title: "Aún no has completado ninguna tarea" },
  todas: { title: "Nada pendiente en este proyecto", text: "Pulsa «+» para añadir una tarea." },
};
const OLD: Record<string, string> = { "7dias": "semana", hechas: "hechas", todas: "hoy", negocio: "hoy", hoy: "hoy" };

export default async function TareasPage({ searchParams }: { searchParams: Promise<{ f?: string; v?: string; abrir?: string }> }) {
  const sp = await searchParams;
  // Enlaces antiguos (?v=…, ?abrir=…) siguen funcionando.
  if (sp.abrir && z.uuid().safeParse(sp.abrir).success) redirect(`/tareas/${sp.abrir}`);
  if (!sp.f && sp.v && OLD[sp.v]) redirect(OLD[sp.v] === "hoy" ? "/tareas" : `/tareas?f=${OLD[sp.v]}`);

  const businesses = await listBusinesses();
  const project = sp.f && z.uuid().safeParse(sp.f).success ? businesses.find((b) => b.id === sp.f) : undefined;
  if (sp.f && z.uuid().safeParse(sp.f).success && !project) redirect("/tareas"); // proyecto que no es tuyo (o no existe)
  const view: TaskView = project ? "todas" : (TASK_VIEWS.find((x) => x === sp.f) ?? "hoy");

  // Tareas «Pedir …» de Stock al día antes de enseñar la lista (BATU lo hacía cada hora con Profity).
  await syncAllStockTasks();
  const [now, tasks, inbox, reminders] = await Promise.all([
    getNow(), listTasks(view, { businessId: project?.id }), countTaskInbox(), view === "hoy" ? listReminders() : Promise.resolve([]),
  ]);
  const bizOptions = businesses.map((b) => ({ id: b.id, name: b.name, color: b.color, icon: b.icon }));
  const chip = (active: boolean) => cn("flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm md:min-h-10", active ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface hover:bg-surface-2");

  return (
    <>
      <PageHeader title="Tareas" />
      <div className="mb-4 flex flex-col gap-3">
        <QuickAdd today={now.date} nowTime={now.time} businessId={project?.id} />
        <nav aria-label="Filtros" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          {TASK_VIEWS.map((x) => (
            <Link key={x} href={x === "hoy" ? "/tareas" : `/tareas?f=${x}`} aria-current={x === view && !project ? "page" : undefined} className={chip(x === view && !project)}>
              {LABELS[x]}
              {x === "bandeja" && inbox > 0 && <span className={cn("rounded-full px-1.5 text-xs font-semibold tabular-nums", x === view ? "bg-accent-foreground/20" : "bg-surface-2")}>{inbox}</span>}
            </Link>
          ))}
          {businesses.map((b) => (
            <Link key={b.id} href={`/tareas?f=${b.id}`} aria-current={project?.id === b.id ? "page" : undefined} className={chip(project?.id === b.id)}>
              <BusinessIcon name={b.icon} color={b.color} className="size-5 rounded-md" />{b.name}
            </Link>
          ))}
        </nav>
      </div>
      {view === "hoy" && <ReminderList today={now.date} reminders={reminders.map((r) => ({ id: r.id, title: r.title, status: r.status, local: nowLocal(new Date(r.remind_at), now.timezone) }))} />}
      <div className="pb-24 md:pb-20">
        <TaskList groups={groupTasks(view, tasks, now.date)} businesses={bizOptions} today={now.date} empty={EMPTY[view]} />
      </div>
      <Link href={project ? `/tareas/nueva?negocio=${project.id}` : "/tareas/nueva"} aria-label="Nueva tarea"
        className="fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg hover:opacity-90 md:right-8 md:bottom-8">
        <Plus className="size-7" aria-hidden />
      </Link>
    </>
  );
}

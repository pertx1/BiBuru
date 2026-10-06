import Link from "next/link";
import { QuickAdd } from "@/components/tasks/quick-add";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { TaskList } from "@/components/tasks/task-list";
import { PageHeader } from "@/components/layout/page-header";
import { listBusinesses } from "@/lib/data";
import { z } from "zod";
import { ReminderList } from "@/components/notifications/reminder-list";
import { nowLocal } from "@/lib/dates";
import { getNow, getTask, listGoals, listReminders, listTasks, TASK_VIEWS, type TaskView } from "@/lib/tasks/data";
import { groupTasks } from "@/lib/tasks/groups";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tareas" };

const LABELS: Record<TaskView, string> = { hoy: "Hoy", "7dias": "Próximos 7 días", todas: "Todas", negocio: "Por negocio", hechas: "Hechas" };
const EMPTY: Record<TaskView, string> = {
  hoy: "Nada para hoy. Escribe arriba lo que se te ocurra y pulsa Enter.",
  "7dias": "No hay nada planificado en los próximos 7 días.",
  todas: "No tienes tareas pendientes. ¡Bien!",
  negocio: "No tienes tareas pendientes.",
  hechas: "Todavía no has completado ninguna tarea.",
};

export default async function TareasPage({ searchParams }: { searchParams: Promise<{ v?: string; abrir?: string }> }) {
  const { v, abrir } = await searchParams;
  const view = (TASK_VIEWS.find((x) => x === v) ?? "hoy") as TaskView;
  const [now, tasks, businesses, goals, openTask, reminders] = await Promise.all([getNow(), listTasks(view), listBusinesses(), listGoals({ status: "active" }), abrir && z.uuid().safeParse(abrir).success ? getTask(abrir) : Promise.resolve(null), view === "hoy" ? listReminders() : Promise.resolve([])]);
  const biz = new Map(businesses.map((b) => [b.id, b.name]));
  const bizOptions = businesses.map((b) => ({ id: b.id, name: b.name, color: b.color }));
  const goalOptions = goals.map((g) => ({ id: g.id, title: g.title }));

  return (
    <>
      <PageHeader title="Tareas" subtitle="Lo que tienes que hacer, sin que se te escape nada." />
      <div className="mb-4 flex flex-col gap-3">
        <QuickAdd today={now.date} nowTime={now.time} />
        <div className="flex items-center justify-between gap-2">
          <nav aria-label="Vistas" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
            {TASK_VIEWS.map((x) => (
              <Link key={x} href={`/tareas?v=${x}`} aria-current={x === view ? "page" : undefined}
                className={cn("flex min-h-11 md:min-h-10 shrink-0 items-center rounded-full border border-border px-3.5 text-sm", x === view ? "border-accent bg-accent text-accent-foreground" : "bg-surface hover:bg-surface-2")}>{LABELS[x]}</Link>
            ))}
          </nav>
          <NewTaskButton businesses={bizOptions} goals={goalOptions} today={now.date} />
        </div>
      </div>
      <ReminderList today={now.date} reminders={reminders.map((r) => ({ id: r.id, title: r.title, status: r.status, local: nowLocal(new Date(r.remind_at), now.timezone) }))} />
      <TaskList groups={groupTasks(view, tasks, now.date, biz)} businesses={bizOptions} goals={goalOptions} today={now.date} emptyText={EMPTY[view]} openTask={openTask} />
    </>
  );
}

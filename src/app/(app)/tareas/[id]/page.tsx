import { AlarmClock, ChevronLeft, Repeat } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { BusinessIcon } from "@/components/businesses/business-icon";
import { PageHeader } from "@/components/layout/page-header";
import { DeleteTaskButton, SubtaskEditor, TaskQuickActions } from "@/components/tasks/task-detail";
import { TaskForm } from "@/components/tasks/task-form";
import { listBusinesses } from "@/lib/data";
import { nowLocal } from "@/lib/dates";
import { getNow, getTask, listGoals } from "@/lib/tasks/data";
import { whenLabel } from "@/lib/tasks/format";
import { PRIORITY_META, taskToFields } from "@/lib/tasks/input";
import { describeRepeat, type Repeat as RepeatKind } from "@/lib/tasks/repeat";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tarea" };

/** Detalle de una tarea (adonde lleva la notificación): acciones rápidas, subtareas, edición y eliminar. */
export default async function TareaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [task, now, businesses, goals] = await Promise.all([getTask(id), getNow(), listBusinesses(), listGoals({ status: "active" })]);
  if (!task) notFound(); // no existe o es de otro espacio
  const done = task.status === "done";
  const biz = businesses.find((b) => b.id === task.business_id);
  const when = whenLabel(task.due_date, task.due_time, now.date);
  const overdue = !done && !!task.due_date && task.due_date < now.date;
  const remind = task.remind_at && !done ? nowLocal(new Date(task.remind_at), now.timezone) : null;
  const prio = PRIORITY_META[task.priority] ?? PRIORITY_META[2];
  const fields = taskToFields(task, now.timezone);

  return (
    <div className="mx-auto w-full max-w-xl">
      <Link href={biz ? `/tareas?f=${biz.id}` : "/tareas"} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-foreground md:min-h-10"><ChevronLeft className="size-4" aria-hidden /> Tareas</Link>
      <PageHeader title={task.title} />
      <div className="-mt-4 mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span className={cn("font-medium", prio.text)}>{prio.emoji} {prio.label}</span>
        {when && <span className={cn(overdue && "font-medium text-danger")}>{when}</span>}
        {biz && <span className="inline-flex items-center gap-1.5"><BusinessIcon name={biz.icon} color={biz.color} className="size-5 rounded-md" />{biz.name}</span>}
        {task.repeat !== "none" && <span className="inline-flex items-center gap-1"><Repeat className="size-4" aria-hidden />{describeRepeat(task.repeat as RepeatKind, task.repeat_days, task.due_date)}</span>}
        {remind && <span className="inline-flex items-center gap-1"><AlarmClock className="size-4" aria-hidden />Aviso {whenLabel(remind.date, remind.time, now.date)?.toLowerCase()}</span>}
        {done && <span className="font-medium text-good">Completada</span>}
      </div>
      {task.notes && <p className="mb-5 whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm">{task.notes}</p>}

      <div className="flex flex-col gap-6">
        <TaskQuickActions id={task.id} done={done} />
        <SubtaskEditor taskId={task.id} subtasks={task.subtasks} />
        <section aria-label="Editar" className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-4 text-sm font-semibold">Editar</h2>
          <TaskForm key={task.updated_at} taskId={task.id} initial={fields} businesses={businesses.map((b) => ({ id: b.id, name: b.name, color: b.color, icon: b.icon }))}
            goals={goals.map((g) => ({ id: g.id, title: g.title }))} today={now.date} returnTo={`/tareas/${task.id}`} />
        </section>
        <DeleteTaskButton id={task.id} />
      </div>
    </div>
  );
}

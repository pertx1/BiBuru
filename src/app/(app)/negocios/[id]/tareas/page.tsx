import { NewTaskButton } from "@/components/tasks/new-task-button";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskList } from "@/components/tasks/task-list";
import { listBusinesses } from "@/lib/data";
import { getNow, listGoals, listTasks } from "@/lib/tasks/data";
import { groupTasks } from "@/lib/tasks/groups";

export const metadata = { title: "Tareas del negocio" };

export default async function TareasNegocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [now, tasks, businesses, goals] = await Promise.all([getNow(), listTasks("todas", { businessId: id }), listBusinesses(), listGoals({ status: "active" })]);
  const bizOptions = businesses.map((b) => ({ id: b.id, name: b.name, color: b.color }));
  const goalOptions = goals.map((g) => ({ id: g.id, title: g.title }));
  return (
    <div className="flex flex-col gap-4">
      <QuickAdd today={now.date} nowTime={now.time} businessId={id} placeholder="Nueva tarea de este negocio…" />
      <div><NewTaskButton businesses={bizOptions} goals={goalOptions} today={now.date} defaultBusinessId={id} /></div>
      <TaskList groups={groupTasks("todas", tasks, now.date, new Map())} businesses={bizOptions} goals={goalOptions} today={now.date} defaultBusinessId={id} emptyText="Este negocio no tiene tareas pendientes." />
    </div>
  );
}

import { Plus } from "lucide-react";
import Link from "next/link";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskList } from "@/components/tasks/task-list";
import { buttonVariants } from "@/components/ui/button";
import { listBusinesses } from "@/lib/data";
import { getNow, listTasks } from "@/lib/tasks/data";
import { groupTasks } from "@/lib/tasks/groups";

export const metadata = { title: "Tareas del negocio" };

export default async function TareasNegocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [now, tasks, businesses] = await Promise.all([getNow(), listTasks("todas", { businessId: id }), listBusinesses()]);
  const bizOptions = businesses.map((b) => ({ id: b.id, name: b.name, color: b.color, icon: b.icon }));
  return (
    <div className="flex flex-col gap-4">
      <QuickAdd today={now.date} nowTime={now.time} businessId={id} placeholder="Nueva tarea de este negocio…" />
      <div><Link href={`/tareas/nueva?negocio=${id}&volver=/negocios/${id}/tareas`} className={buttonVariants({ variant: "secondary" })}><Plus className="size-4" aria-hidden /> Tarea completa</Link></div>
      <TaskList groups={groupTasks("todas", tasks, now.date)} businesses={bizOptions} today={now.date} empty={{ title: "Este negocio no tiene tareas pendientes." }} />
    </div>
  );
}

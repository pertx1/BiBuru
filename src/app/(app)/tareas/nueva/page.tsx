import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { TaskForm } from "@/components/tasks/task-form";
import { listBusinesses } from "@/lib/data";
import { addDays, isValidISO } from "@/lib/dates";
import { getNow, listGoals } from "@/lib/tasks/data";

export const metadata = { title: "Nueva tarea" };

/** Alta completa (el «+» de Tareas). Admite `?negocio=`, `?objetivo=`, `?fecha=hoy|manana|AAAA-MM-DD` y `?volver=`. */
export default async function NuevaTareaPage({ searchParams }: { searchParams: Promise<{ negocio?: string; objetivo?: string; fecha?: string; volver?: string }> }) {
  const sp = await searchParams;
  const [now, businesses, goals] = await Promise.all([getNow(), listBusinesses(), listGoals({ status: "active" })]);
  const uuid = z.uuid();
  const businessId = sp.negocio && uuid.safeParse(sp.negocio).success && businesses.some((b) => b.id === sp.negocio) ? sp.negocio : null;
  const goalId = sp.objetivo && uuid.safeParse(sp.objetivo).success && goals.some((g) => g.id === sp.objetivo) ? sp.objetivo : null;
  const dueDate = sp.fecha === "hoy" ? now.date : sp.fecha === "manana" ? addDays(now.date, 1) : sp.fecha && isValidISO(sp.fecha) ? sp.fecha : null;
  // Solo rutas internas (nada de «//otro-sitio»).
  const back = sp.volver && /^\/(?!\/)[\w\-/?=&%.]*$/.test(sp.volver) ? sp.volver : businessId ? `/tareas?f=${businessId}` : "/tareas";

  return (
    <div className="mx-auto w-full max-w-xl">
      <Link href={back} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-foreground md:min-h-10"><ChevronLeft className="size-4" aria-hidden /> Tareas</Link>
      <PageHeader title="Nueva tarea" />
      <TaskForm initial={{ businessId, goalId, dueDate }} businesses={businesses.map((b) => ({ id: b.id, name: b.name, color: b.color, icon: b.icon }))}
        goals={goals.map((g) => ({ id: g.id, title: g.title }))} today={now.date} returnTo={back} />
    </div>
  );
}

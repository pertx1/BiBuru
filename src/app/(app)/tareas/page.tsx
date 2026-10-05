import { CheckSquare } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Tareas" };

export default function Page() {
  return (
    <>
      <PageHeader title="Tareas" subtitle="Lo que tienes que hacer, sin que se te escape nada." />
      <EmptyState icon={CheckSquare} title="Aquí vivirán tus tareas">
        Llegan en la Fase 3: vistas Hoy y Próximos 7 días, fechas en lenguaje natural y recurrencia.
      </EmptyState>
    </>
  );
}

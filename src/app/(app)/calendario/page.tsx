import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Calendario" };

export default function Page() {
  return (
    <>
      <PageHeader title="Calendario" subtitle="Eventos y tareas con fecha." />
      <EmptyState icon={CalendarDays} title="Calendario en camino">
        Llega en la Fase 3, con vistas de mes, semana y agenda.
      </EmptyState>
    </>
  );
}

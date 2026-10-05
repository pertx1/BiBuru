import { NotebookText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Notas" };

export default function Page() {
  return (
    <>
      <PageHeader title="Notas" subtitle="Ideas, apuntes y carpetas." />
      <EmptyState icon={NotebookText} title="Notas en camino">
        Llegan en la Fase 4, con carpetas, etiquetas y búsqueda global.
      </EmptyState>
    </>
  );
}

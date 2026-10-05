import { Target } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Objetivos" };

export default function Page() {
  return (
    <>
      <PageHeader title="Objetivos" subtitle="Metas con progreso medible." />
      <EmptyState icon={Target} title="Objetivos en camino">
        Llegan en la Fase 3, con progreso manual o calculado desde tus negocios.
      </EmptyState>
    </>
  );
}

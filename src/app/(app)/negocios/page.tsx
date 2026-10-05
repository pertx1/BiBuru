import { Briefcase } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Negocios" };

export default function Page() {
  return (
    <>
      <PageHeader title="Negocios" subtitle="Pedidos, gastos y estadísticas de cada negocio." />
      <EmptyState icon={Briefcase} title="Aún no hay negocios">
        En la Fase 2 podrás crear tus negocios (Akerra, Vinted…), registrar pedidos y gastos e importar PROFITY.
      </EmptyState>
    </>
  );
}

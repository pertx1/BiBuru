import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Captura rápida" };

export default function Page() {
  return (
    <>
      <PageHeader title="Captura rápida" subtitle="Apunta lo que sea en menos de 5 segundos." />
      <EmptyState icon={Plus} title="La captura llega en la Fase 4">
        Este botón central será tu entrada para texto y voz. De momento está aquí para que veas dónde irá.
      </EmptyState>
    </>
  );
}

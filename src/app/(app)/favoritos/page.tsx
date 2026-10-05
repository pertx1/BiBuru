import { Video } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Favoritos" };

export default function Page() {
  return (
    <>
      <PageHeader title="Favoritos" subtitle="Vídeos guardados y analizados." />
      <EmptyState icon={Video} title="Favoritos en camino">
        Llegan en la Fase 7: enlaces de YouTube y TikTok, análisis con IA y sincronización.
      </EmptyState>
    </>
  );
}

import { PageHeader } from "@/components/layout/page-header";
import { RedesView, type RedesSP } from "@/components/social/redes-view";

export const metadata = { title: "Redes" };

/** Todas las redes (con filtro por negocio): Bandeja, Contenido y Estadísticas. */
export default async function RedesPage({ searchParams }: { searchParams: Promise<RedesSP> }) {
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Redes" />
      <RedesView sp={sp} basePath="/redes" />
    </>
  );
}

import { RedesView, type RedesSP } from "@/components/social/redes-view";

export const metadata = { title: "Redes del negocio" };

/** Pestaña «Redes» del negocio: todas sus cuentas de Instagram y TikTok, con Bandeja, Contenido y Estadísticas. */
export default async function RedesNegocioPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RedesSP> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <RedesView sp={sp} businessId={id} basePath={`/negocios/${id}/redes`} />;
}

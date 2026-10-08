import { redirect } from "next/navigation";

/** Ingresos ya no es una pestaña: los ingresos sueltos están al final de «Estadísticas» (y suman en Resumen). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/negocios/${id}/estadisticas#ingresos`);
}

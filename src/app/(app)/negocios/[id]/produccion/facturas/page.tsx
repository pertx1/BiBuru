import { redirect } from "next/navigation";

/** Antes en Producción: ahora es la pestaña «Facturas». */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/negocios/${id}/facturas`);
}

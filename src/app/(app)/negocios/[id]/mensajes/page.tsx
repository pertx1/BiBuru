import { redirect } from "next/navigation";

/** La pestaña Mensajes (solo correo) se quitó con el correo: los enlaces antiguos llevan al Resumen del negocio. */
export default async function MensajesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/negocios/${id}`);
}

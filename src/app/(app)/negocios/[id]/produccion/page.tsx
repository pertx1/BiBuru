import { redirect } from "next/navigation";

/** Producción ya no es una pestaña: su stock está en «Stock». */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/negocios/${id}/stock`);
}

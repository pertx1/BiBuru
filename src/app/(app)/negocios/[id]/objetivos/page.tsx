import { redirect } from "next/navigation";

/** Los objetivos del negocio están en Objetivos, filtrados por este negocio. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/objetivos?negocio=${id}`);
}

import { redirect } from "next/navigation";

/** Las tareas del negocio están en Tareas, filtradas por este negocio. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/tareas?f=${id}`);
}

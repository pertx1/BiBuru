import { Home } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Inicio" };

export default async function HomePage() {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("display_name").maybeSingle();
  return (
    <>
      <PageHeader
        title={profile?.display_name ? `Hola, ${profile.display_name}` : "Inicio"}
        subtitle="Qué tienes que hacer hoy y cómo van tus negocios."
      />
      <EmptyState icon={Home} title="Tu panel está listo">
        La base funciona: has entrado con tu correo. En las siguientes fases aquí verás tus tareas de hoy, tus negocios y tus objetivos.
      </EmptyState>
    </>
  );
}

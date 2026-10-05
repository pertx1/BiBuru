import { notFound } from "next/navigation";
import { ProductionNav } from "@/components/production/production-nav";
import { EmptyState } from "@/components/ui/empty-state";
import { Boxes } from "lucide-react";
import { getBusiness } from "@/lib/data";

export default async function ProductionLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const business = await getBusiness(id);
  if (!business) notFound();
  if (!business.production_enabled) {
    return <EmptyState icon={Boxes} title="Módulo de producción desactivado">Pulsa «Editar» arriba y activa «Módulo de producción» para llevar el stock de prendas y DTF y la bolsa para la imprenta.</EmptyState>;
  }
  return (<><ProductionNav id={id} />{children}</>);
}

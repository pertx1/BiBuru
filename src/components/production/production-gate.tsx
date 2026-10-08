import { Boxes } from "lucide-react";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { getBusiness } from "@/lib/data";

/** Bolsa imprenta, Facturas y Reglas Antola necesitan el módulo de producción del negocio. */
export async function ProductionGate({ id, children }: { id: string; children: React.ReactNode }) {
  const business = await getBusiness(id);
  if (!business) notFound();
  if (!business.production_enabled) {
    return <EmptyState icon={Boxes} title="Módulo de producción desactivado">Pulsa «Editar» arriba y activa «Módulo de producción» para llevar el stock de prendas y DTF, la bolsa para la imprenta, las facturas y las reglas de Antola.</EmptyState>;
  }
  return <>{children}</>;
}

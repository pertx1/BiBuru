import { BagView } from "@/components/production/bag-view";
import { ProductionGate } from "@/components/production/production-gate";
import { getPrintBagData } from "@/lib/production/data";

export const metadata = { title: "Bolsa para la imprenta" };

export default async function BolsaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductionGate id={id}><BagView businessId={id} bag={await getPrintBagData(id)} /></ProductionGate>;
}

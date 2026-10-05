import { BagView } from "@/components/production/bag-view";
import { getPrintBagData } from "@/lib/production/data";

export const metadata = { title: "Bolsa para la imprenta" };

export default async function BolsaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BagView businessId={id} bag={await getPrintBagData(id)} />;
}

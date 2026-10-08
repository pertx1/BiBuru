import { InvoicesView } from "@/components/production/invoices-view";
import { ProductionGate } from "@/components/production/production-gate";
import { listInvoices } from "@/lib/production/data";

export const metadata = { title: "Facturas" };

export default async function FacturasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductionGate id={id}><InvoicesView businessId={id} invoices={await listInvoices(id)} /></ProductionGate>;
}

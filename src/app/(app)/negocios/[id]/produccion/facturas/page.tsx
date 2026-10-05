import { InvoicesView } from "@/components/production/invoices-view";
import { listInvoices } from "@/lib/production/data";

export const metadata = { title: "Facturas" };

export default async function FacturasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoicesView businessId={id} invoices={await listInvoices(id)} />;
}

import { IncomesView } from "@/components/businesses/simple-lists";
import { listIncomes } from "@/lib/data";
import { todayISO } from "@/lib/dates";

export const metadata = { title: "Ingresos" };

export default async function IngresosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IncomesView businessId={id} incomes={await listIncomes(id)} today={todayISO()} />;
}

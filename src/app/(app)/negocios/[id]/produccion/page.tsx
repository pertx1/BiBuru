import { StockView } from "@/components/production/stock-view";
import { getStockOverview } from "@/lib/production/data";
import { syncStockTasks } from "@/lib/stock/service";

export const metadata = { title: "Stock" };

export default async function StockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await syncStockTasks(id); // las tareas «Pedir …» coinciden con «Pedir ya»
  const overview = await getStockOverview(id);
  return <StockView businessId={id} overview={overview} models={overview.catalog.models} />;
}

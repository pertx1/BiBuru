import { PeriodSelector } from "@/components/businesses/period-selector";
import { StatsPanel } from "@/components/businesses/stats-panel";
import { periodFromParams, type PeriodSearchParams } from "@/lib/period-params";

export const metadata = { title: "Estadísticas" };

export default async function EstadisticasPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<PeriodSearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { preset, period } = periodFromParams(sp);
  return (
    <div className="flex flex-col gap-5">
      <PeriodSelector basePath={`/negocios/${id}/estadisticas`} preset={preset} from={period.from} to={period.to} />
      <StatsPanel period={period} preset={preset} businessId={id} />
    </div>
  );
}

import { PeriodSelector } from "@/components/businesses/period-selector";
import { IncomesView } from "@/components/businesses/simple-lists";
import { StatsPanel } from "@/components/businesses/stats-panel";
import { listIncomes } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { periodFromParams, type PeriodSearchParams } from "@/lib/period-params";

export const metadata = { title: "Estadísticas" };

/** Estadísticas del negocio y, al final, los ingresos sueltos (antes en la pestaña Ingresos). */
export default async function EstadisticasPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<PeriodSearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { preset, period } = periodFromParams(sp);
  const incomes = await listIncomes(id);
  return (
    <div className="flex flex-col gap-5">
      <PeriodSelector basePath={`/negocios/${id}/estadisticas`} preset={preset} from={period.from} to={period.to} />
      <StatsPanel period={period} preset={preset} businessId={id} />
      <section id="ingresos" className="scroll-mt-20">
        <h2 className="mb-1 text-base font-semibold">Ingresos sueltos</h2>
        <p className="mb-3 text-sm text-muted">Lo que entra sin ser un pedido (subvenciones, ventas en mano…). Suman en el Resumen y en estas estadísticas.</p>
        <IncomesView businessId={id} incomes={incomes} today={todayISO()} />
      </section>
    </div>
  );
}

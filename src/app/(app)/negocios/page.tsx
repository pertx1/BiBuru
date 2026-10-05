import Link from "next/link";
import { Briefcase } from "lucide-react";
import { BusinessFormButton } from "@/components/businesses/business-form";
import { BusinessIcon } from "@/components/businesses/business-icon";
import { PeriodSelector } from "@/components/businesses/period-selector";
import { StatsPanel } from "@/components/businesses/stats-panel";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getTotalsWithPrevious, listBusinesses } from "@/lib/data";
import { formatEUR, variationPct } from "@/lib/money";
import { periodFromParams, type PeriodSearchParams } from "@/lib/period-params";

export const metadata = { title: "Negocios" };

export default async function NegociosPage({ searchParams }: { searchParams: Promise<PeriodSearchParams & { archivados?: string }> }) {
  const sp = await searchParams;
  const { preset, period } = periodFromParams(sp);
  const showArchived = sp.archivados === "1";
  const [businesses, totals] = await Promise.all([listBusinesses(showArchived), getTotalsWithPrevious(period)]);

  return (
    <>
      <PageHeader title="Negocios" subtitle="Todos tus negocios de un vistazo." />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <BusinessFormButton />
        <Link href={showArchived ? "/negocios" : "/negocios?archivados=1"} className="text-sm text-muted underline underline-offset-2">
          {showArchived ? "Ocultar archivados" : "Ver archivados"}
        </Link>
      </div>

      {businesses.length === 0 ? (
        <EmptyState icon={Briefcase} title="Crea tu primer negocio">
          Pulsa «Nuevo negocio». Después podrás registrar pedidos y gastos, ver estadísticas e importar tus datos de PROFITY.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          <PeriodSelector basePath="/negocios" preset={preset} from={period.from} to={period.to} extraParams={showArchived ? { archivados: "1" } : undefined} />
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {businesses.map((b) => {
              const cur = totals.byBusiness.get(b.id) ?? { income: 0, expense: 0, profit: 0, orders: 0 };
              const prev = totals.previousByBusiness.get(b.id) ?? { income: 0, expense: 0, profit: 0, orders: 0 };
              const v = variationPct(cur.profit, prev.profit);
              return (
                <li key={b.id}>
                  <Link href={`/negocios/${b.id}`} className="block rounded-xl border border-border border-l-4 bg-surface p-4 hover:bg-surface-2" style={{ borderLeftColor: b.color }}>
                    <div className="flex items-center gap-3">
                      <BusinessIcon name={b.icon} color={b.color} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{b.name}{b.archived && <span className="ml-2 text-xs font-normal text-muted">archivado</span>}</p>
                        {b.description && <p className="truncate text-xs text-muted">{b.description}</p>}
                      </div>
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div><dt className="text-xs text-muted">Ingresos</dt><dd className="font-medium tabular-nums">{formatEUR(cur.income)}</dd></div>
                      <div><dt className="text-xs text-muted">Gastos</dt><dd className="font-medium tabular-nums">{formatEUR(cur.expense)}</dd></div>
                      <div>
                        <dt className="text-xs text-muted">Beneficio</dt>
                        <dd className="font-semibold tabular-nums">{formatEUR(cur.profit)}</dd>
                        {v !== null && <dd className={`text-xs ${v >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-danger"}`}>{v > 0 ? "+" : ""}{v.toLocaleString("es-ES")} %</dd>}
                      </div>
                    </dl>
                  </Link>
                </li>
              );
            })}
          </ul>
          <section>
            <h2 className="mb-3 text-lg font-semibold">Todos los negocios</h2>
            <StatsPanel period={period} preset={preset} />
          </section>
        </div>
      )}
    </>
  );
}

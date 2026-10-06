import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Scale } from "lucide-react";
import { getFinanceSummary } from "@/lib/home/data";
import { formatEUR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { FinanceChartLazy } from "../charts/lazy";
import { businessOf, type WidgetProps } from "../types";

function Kpi({ label, value, month, icon, tone, valueClass }: { label: string; value: number; month: number; icon: React.ReactNode; tone: string; valueClass?: string }) {
  return (
    <div className="min-w-[78%] snap-start rounded-xl border border-border bg-surface p-4 sm:min-w-0">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted">{label}</p>
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tone)} aria-hidden>{icon}</span>
      </div>
      <p className={cn("mt-1 text-[1.65rem] font-bold tabular-nums tracking-tight", valueClass)}>{formatEUR(value)}</p>
      <p className="mt-0.5 text-xs text-muted tabular-nums">{formatEUR(month)} este mes</p>
    </div>
  );
}

/** Resumen financiero: totales de siempre (con lo del mes debajo) y el área de ingresos/gastos de los últimos meses. */
export async function FinanceSummaryWidget({ w, ctx }: WidgetProps) {
  const biz = businessOf(w, ctx);
  const months = Number(w.settings.months) || 6;
  const { total, month, series } = await getFinanceSummary(ctx.today, months, biz?.id);
  return (
    <section className="flex flex-col gap-3" aria-label={`Resumen financiero${biz ? ` de ${biz.name}` : ""}`}>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible [scrollbar-width:none]">
        <Kpi label="Ingresos totales" value={total.income} month={month.income} tone="bg-blue-500/15 text-income" icon={<ArrowUpRight className="size-5" />} />
        <Kpi label="Gastos totales" value={total.expense} month={month.expense} tone="bg-red-500/15 text-expense" icon={<ArrowDownRight className="size-5" />} />
        <Kpi label="Beneficio" value={total.profit} month={month.profit} tone="bg-green-500/15 text-good" icon={<Scale className="size-5" />} valueClass={total.profit >= 0 ? "text-good" : "text-bad"} />
      </div>
      <div className="rounded-xl border border-border bg-surface p-4">
        {/* El gráfico no es un enlace: tocarlo muestra el detalle del mes. Las estadísticas se abren desde el título. */}
        <Link href={biz ? `/negocios/${biz.id}/estadisticas` : "/negocios"} className="mb-3 flex min-h-9 items-center justify-between gap-2 font-semibold">
          <span>Últimos {months} meses{biz ? ` · ${biz.name}` : ""}</span><ChevronRight className="size-4 text-muted" aria-hidden />
        </Link>
        <FinanceChartLazy data={series} />
      </div>
    </section>
  );
}

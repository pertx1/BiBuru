import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
import { variationPct } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Marco común de los widgets: tarjeta gris con borde fino, título pequeño y enlace opcional. */
export function WidgetCard({ title, href, children, className }: { title: string; href?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex h-full min-w-0 flex-col rounded-xl border border-border bg-surface p-4", className)}>
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2 className="truncate text-[13px] font-medium text-muted">{title}</h2>
        {href && <Link href={href} className="-m-2 flex min-h-11 md:min-h-9 min-w-11 md:min-w-9 items-center justify-center text-muted hover:text-foreground" aria-label={`Abrir ${title}`}><ChevronRight className="size-4" aria-hidden /></Link>}
      </header>
      {children}
    </section>
  );
}

/** % de cambio frente al periodo anterior, con flecha verde (bien) o roja (mal). */
export function Delta({ current, previous, goodWhenUp = true, className }: { current: number; previous: number; goodWhenUp?: boolean; className?: string }) {
  const pct = variationPct(current, previous);
  if (pct === null) return current === 0 ? null : <span className={cn("text-xs text-muted", className)}>sin datos previos</span>;
  if (pct === 0) return <span className={cn("text-xs text-muted", className)}>0 %</span>;
  const good = (pct > 0) === goodWhenUp;
  const Icon = pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums", good ? "text-good" : "text-bad", className)}>
      <Icon className="size-3.5" aria-hidden />{Math.abs(pct).toLocaleString("es-ES")} %
      <span className="sr-only">{pct > 0 ? "más" : "menos"} que el periodo anterior</span>
    </span>
  );
}

export function WidgetSkeleton({ tall }: { tall?: boolean }) {
  return (
    <div className={cn("flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-4", tall ? "min-h-80" : "min-h-36")} aria-busy="true" aria-label="Cargando">
      <div className="skeleton h-3 w-24" />
      <div className="skeleton h-7 w-32" />
      <div className="skeleton mt-auto h-12 w-full" />
    </div>
  );
}

import Link from "next/link";
import { HOME_PERIODS, type HomePeriodKey } from "@/lib/home/layout";
import { cn } from "@/lib/utils";

/** Selector de periodo común de Inicio (afecta a los widgets de negocio) y «Comparar con el anterior». Sin JS: enlaces. */
export function PeriodBar({ period, compare, basePath = "/" }: { period: HomePeriodKey; compare: boolean; basePath?: string }) {
  const href = (p: HomePeriodKey, c: boolean) => `${basePath}?periodo=${p}${c ? "" : "&comparar=0"}`;
  const chip = "flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-sm md:min-h-10";
  return (
    <nav aria-label="Periodo de los widgets de negocio" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 [scrollbar-width:none]">
      {HOME_PERIODS.map((p) => (
        <Link key={p.key} href={href(p.key, compare)} scroll={false} aria-current={p.key === period ? "true" : undefined}
          className={cn(chip, p.key === period ? "border-accent bg-accent font-semibold text-accent-foreground" : "border-border bg-surface")}>{p.label}</Link>
      ))}
      <Link href={href(period, !compare)} scroll={false} role="switch" aria-checked={compare}
        className={cn(chip, "gap-1.5", compare ? "border-accent text-accent" : "border-border bg-surface text-muted")}>
        <span className={cn("size-2 rounded-full", compare ? "bg-accent" : "bg-muted")} aria-hidden />Comparar
      </Link>
    </nav>
  );
}

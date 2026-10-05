import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Tarjeta de cifra con variación frente al periodo anterior. */
export function Stat({
  label, value, variation, goodWhenUp = true, sub,
}: {
  label: string;
  value: string;
  variation?: number | null;
  goodWhenUp?: boolean;
  sub?: string;
}) {
  const good = variation == null || variation === 0 ? null : (variation > 0) === goodWhenUp;
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        {variation != null && variation !== 0 && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", good ? "text-emerald-600 dark:text-emerald-400" : "text-danger")}>
            {variation > 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
            {Math.abs(variation).toLocaleString("es-ES")} %
          </span>
        )}
        {sub && <span className="text-muted">{sub}</span>}
      </div>
    </div>
  );
}

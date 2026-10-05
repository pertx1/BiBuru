import Link from "next/link";
import { PERIOD_LABELS, type PeriodPreset } from "@/lib/dates";
import { cn } from "@/lib/utils";

const PRESETS: PeriodPreset[] = ["this_month", "last_month", "last_3_months", "this_year", "last_year"];

/** Selector de rango sin JavaScript: enlaces con ?periodo=… y un formulario GET para fechas libres. */
export function PeriodSelector({
  basePath, preset, from, to, extraParams,
}: {
  basePath: string;
  preset: PeriodPreset;
  from: string;
  to: string;
  extraParams?: Record<string, string>;
}) {
  const href = (p: PeriodPreset) => {
    const sp = new URLSearchParams({ ...extraParams, periodo: p });
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {PRESETS.map((p) => (
          <Link
            key={p} href={href(p)} scroll={false}
            aria-current={preset === p ? "true" : undefined}
            className={cn(
              "flex min-h-10 shrink-0 items-center rounded-full border border-border px-3.5 text-sm",
              preset === p ? "border-accent bg-accent text-accent-foreground" : "bg-surface hover:bg-surface-2",
            )}
          >
            {PERIOD_LABELS[p]}
          </Link>
        ))}
      </div>
      <form method="get" action={basePath} className="flex flex-wrap items-end gap-2 text-sm">
        {Object.entries(extraParams ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <input type="hidden" name="periodo" value="custom" />
        <label className="flex flex-col gap-1 text-xs text-muted">Desde
          <input type="date" name="desde" defaultValue={from} className="min-h-10 rounded-lg border border-border bg-surface px-2 text-sm text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">Hasta
          <input type="date" name="hasta" defaultValue={to} className="min-h-10 rounded-lg border border-border bg-surface px-2 text-sm text-foreground" />
        </label>
        <button type="submit" className={cn("min-h-10 rounded-lg border border-border bg-surface px-3 hover:bg-surface-2", preset === "custom" && "border-accent")}>
          Aplicar
        </button>
      </form>
    </div>
  );
}

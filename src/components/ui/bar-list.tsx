/** Barras horizontales con CSS puro (sin JS): ranking de productos, categorías… */
export function BarList({
  rows, format, empty = "Sin datos en este periodo.",
}: {
  rows: { label: string; value: number; color?: string; sub?: string }[];
  format: (v: number) => string;
  empty?: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 tabular-nums text-muted">
              {r.sub && <span className="mr-2 text-xs">{r.sub}</span>}
              <span className="font-medium text-foreground">{format(r.value)}</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, backgroundColor: r.color ?? "var(--accent)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

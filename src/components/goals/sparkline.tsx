import { formatDate } from "@/lib/dates";

/** Histórico de avance como línea simple (SVG, sin librerías). */
export function Sparkline({ points, format }: { points: { date: string; value: number }[]; format: (v: number) => string }) {
  if (points.length < 2) return <p className="text-sm text-muted">El histórico se dibujará cuando haya al menos dos actualizaciones.</p>;
  const w = 320, h = 80, pad = 6;
  const xs = points.map((_, i) => pad + (i * (w - 2 * pad)) / (points.length - 1));
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const ys = vals.map((v) => h - pad - (max === min ? 0.5 : (v - min) / (max - min)) * (h - 2 * pad));
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full" role="img" aria-label={`Evolución de ${formatDate(points[0].date)} a ${formatDate(points.at(-1)!.date)}`}>
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {xs.map((x, i) => <circle key={i} cx={x} cy={ys[i]} r="3" fill="var(--accent)" />)}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted"><span>{formatDate(points[0].date)} · {format(points[0].value)}</span><span>{formatDate(points.at(-1)!.date)} · {format(points.at(-1)!.value)}</span></div>
    </div>
  );
}

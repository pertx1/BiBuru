"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ComparePoint } from "@/lib/home/period";
import { eur, pointLabel } from "./format";

export type KpiChartProps = { points: ComparePoint[]; color: string; granularity: "day" | "month"; compare: boolean; compact: boolean; label: string };

function Tip({ active, payload, granularity, compare }: { active?: boolean; payload?: { payload: ComparePoint }[]; granularity: "day" | "month"; compare: boolean }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="flex justify-between gap-4"><span className="text-muted">{pointLabel(p.date, granularity)}</span><span className="font-semibold tabular-nums">{eur(p.current)}</span></p>
      {compare && p.previous != null && <p className="mt-0.5 flex justify-between gap-4"><span className="text-muted">{pointLabel(p.prevDate, granularity)}</span><span className="tabular-nums text-muted">{eur(p.previous)}</span></p>}
    </div>
  );
}

/** Línea suave del periodo actual + discontinua tenue del anterior. Ejes mínimos, rejilla casi invisible (estilo Shopify). */
export default function KpiChart({ points, color, granularity, compare, compact, label }: KpiChartProps) {
  const first = points[0]?.date, last = points.at(-1)?.date;
  return (
    <div className={compact ? "h-14 w-full" : "h-32 w-full"} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
          {!compact && <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />}
          <YAxis hide domain={[0, "auto"]} />
          <XAxis dataKey="date" hide={compact} ticks={first && last && first !== last ? [first, last] : undefined} interval="preserveStartEnd"
            tickFormatter={(v: string) => pointLabel(v, granularity)} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted)" />
          <Tooltip content={<Tip granularity={granularity} compare={compare} />} cursor={{ stroke: "var(--muted)", strokeOpacity: 0.4 }} />
          {compare && <Line dataKey="previous" type="monotone" stroke={color} strokeOpacity={0.4} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls />}
          <Line dataKey="current" type="monotone" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pointLabel } from "@/components/home/charts/format";

type Pt = { day: string; value: number | null };
const fmt = (n: number) => n.toLocaleString("es-ES");
const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

function Tip({ active, payload, label }: { active?: boolean; payload?: { payload: Pt }[]; label: string }) {
  if (!active || !payload?.length || payload[0].payload.value == null) return null;
  const p = payload[0].payload;
  return <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg"><p className="mb-1 font-semibold">{pointLabel(p.day, "day")}</p><p className="flex justify-between gap-4"><span>{label}</span><span className="tabular-nums">{fmt(p.value!)}</span></p></div>;
}

/** Una serie diaria, con el mismo estilo que el Resumen financiero (área suave o barras, azul de «ingresos»). */
export default function SocialChart({ data, label, kind = "area" }: { data: Pt[]; label: string; kind?: "area" | "bar" }) {
  const common = { data, margin: { top: 8, right: 8, left: 0, bottom: 0 } };
  const axes = [
    <CartesianGrid key="g" vertical={false} stroke="var(--border)" strokeOpacity={0.6} />,
    <XAxis key="x" dataKey="day" tickFormatter={(v: string) => pointLabel(v, "day")} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted)" interval="preserveStartEnd" minTickGap={16} />,
    <YAxis key="y" tickFormatter={short} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted)" width={40} tickCount={4} domain={kind === "area" ? ["auto", "auto"] : [0, "auto"]} />,
    <Tooltip key="t" content={<Tip label={label} />} cursor={kind === "area" ? { stroke: "var(--muted)", strokeOpacity: 0.4 } : { fill: "var(--surface-2)" }} />,
  ];
  return (
    <div className="h-48 w-full" role="img" aria-label={`${label} por día`}>
      <ResponsiveContainer width="100%" height="100%">
        {kind === "area" ? (
          <AreaChart {...common}>
            <defs><linearGradient id={`sc-${label}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart-income)" stopOpacity={0.22} /><stop offset="1" stopColor="var(--chart-income)" stopOpacity={0} /></linearGradient></defs>
            {axes}
            <Area dataKey="value" type="monotone" stroke="var(--chart-income)" strokeWidth={2} fill={`url(#sc-${label})`} dot={false} connectNulls isAnimationActive={false} />
          </AreaChart>
        ) : (
          <BarChart {...common}>{axes}<Bar dataKey="value" fill="var(--chart-income)" radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

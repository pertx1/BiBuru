"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { eur, pointLabel } from "@/components/home/charts/format";
import { shortEuros } from "@/lib/home/finance";

type Row = { month: string; collected: number; pending: number };

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">{pointLabel(r.month, "month")}</p>
      <p className="flex justify-between gap-4"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-income" />Cobrado</span><span className="tabular-nums">{eur(r.collected)}</span></p>
      <p className="flex justify-between gap-4"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-expense" />Pendiente</span><span className="tabular-nums">{eur(r.pending)}</span></p>
    </div>
  );
}

/** Cobrado (azul) frente a pendiente (rojo) por mes: mismo estilo que el Resumen financiero. */
export default function CollectionsChart({ data }: { data: Row[] }) {
  const rows = data.map((d) => ({ ...d, c: d.collected / 100, p: d.pending / 100 }));
  return (
    <div>
      <div className="h-52 w-full" role="img" aria-label="Cobrado y pendiente por mes">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="col-c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart-income)" stopOpacity={0.22} /><stop offset="1" stopColor="var(--chart-income)" stopOpacity={0} /></linearGradient>
              <linearGradient id="col-p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart-expense)" stopOpacity={0.18} /><stop offset="1" stopColor="var(--chart-expense)" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
            <XAxis dataKey="month" tickFormatter={(v: string) => pointLabel(v, "month")} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted)" interval="preserveStartEnd" minTickGap={12} />
            <YAxis tickFormatter={shortEuros} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted)" width={40} tickCount={5} />
            <Tooltip content={<Tip />} cursor={{ stroke: "var(--muted)", strokeOpacity: 0.4 }} />
            <Area dataKey="c" name="Cobrado" type="monotone" stroke="var(--chart-income)" strokeWidth={2} fill="url(#col-c)" dot={false} isAnimationActive={false} />
            <Area dataKey="p" name="Pendiente" type="monotone" stroke="var(--chart-expense)" strokeWidth={2} fill="url(#col-p)" dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex justify-center gap-5 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-income" />Cobrado</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-expense" />Pendiente</span>
      </div>
    </div>
  );
}

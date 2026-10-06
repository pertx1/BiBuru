"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { shortEuros, type MonthRow } from "@/lib/home/finance";
import { eur, pointLabel } from "./format";

type Row = MonthRow & { inc: number; exp: number };

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">{pointLabel(r.month, "month")}</p>
      <p className="flex justify-between gap-4"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-income" />Ingresos</span><span className="tabular-nums">{eur(r.income)}</span></p>
      <p className="flex justify-between gap-4"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-expense" />Gastos</span><span className="tabular-nums">{eur(r.expense)}</span></p>
      <p className={`mt-1 flex justify-between gap-4 border-t border-border pt-1 font-semibold ${r.profit >= 0 ? "text-good" : "text-bad"}`}><span>Beneficio</span><span className="tabular-nums">{eur(r.profit)}</span></p>
    </div>
  );
}

/** Área suave de ingresos (azul) y gastos (rojo) por mes, con degradado muy tenue. */
export default function FinanceChart({ data }: { data: MonthRow[] }) {
  const rows: Row[] = data.map((d) => ({ ...d, inc: d.income / 100, exp: d.expense / 100 }));
  return (
    <div>
      <div className="h-56 w-full" role="img" aria-label="Ingresos y gastos por mes">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="fin-inc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart-income)" stopOpacity={0.22} /><stop offset="1" stopColor="var(--chart-income)" stopOpacity={0} /></linearGradient>
              <linearGradient id="fin-exp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart-expense)" stopOpacity={0.18} /><stop offset="1" stopColor="var(--chart-expense)" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
            <XAxis dataKey="month" tickFormatter={(v: string) => pointLabel(v, "month")} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted)" interval="preserveStartEnd" minTickGap={12} />
            <YAxis tickFormatter={shortEuros} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted)" width={40} tickCount={5} />
            <Tooltip content={<Tip />} cursor={{ stroke: "var(--muted)", strokeOpacity: 0.4 }} />
            <Area dataKey="inc" name="Ingresos" type="monotone" stroke="var(--chart-income)" strokeWidth={2} fill="url(#fin-inc)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} isAnimationActive={false} />
            <Area dataKey="exp" name="Gastos" type="monotone" stroke="var(--chart-expense)" strokeWidth={2} fill="url(#fin-exp)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex justify-center gap-5 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-income" />Ingresos</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-expense" />Gastos</span>
      </div>
    </div>
  );
}

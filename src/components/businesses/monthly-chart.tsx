"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { monthLabel } from "@/lib/dates";
import { formatEUR } from "@/lib/money";

export type MonthPoint = { month: string; income: number; expense: number; profit: number };

/** Ingresos, gastos y beneficio por mes. */
export default function MonthlyChart({ data }: { data: MonthPoint[] }) {
  if (data.length === 0) return null;
  const rows = data.map((d) => ({ name: monthLabel(d.month), Ingresos: d.income / 100, Gastos: d.expense / 100, Beneficio: d.profit / 100 }));
  return (
    <div className="h-64 w-full" role="img" aria-label="Gráfico de ingresos, gastos y beneficio por mes">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted)" />
          <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted)" width={56} tickFormatter={(v: number) => `${v}€`} />
          <Tooltip
            formatter={(v) => formatEUR(Math.round(Number(v) * 100))}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Ingresos" fill="#0f766e" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Gastos" fill="#d97706" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Beneficio" fill="#2563eb" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

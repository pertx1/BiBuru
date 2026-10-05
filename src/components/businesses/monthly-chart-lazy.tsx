"use client";

import dynamic from "next/dynamic";
import type { MonthPoint } from "./monthly-chart";

/** Recharts pesa: se carga solo cuando hay que dibujar el gráfico. */
const Chart = dynamic(() => import("./monthly-chart"), {
  ssr: false,
  loading: () => <div className="skeleton h-64 w-full" aria-hidden />,
});

export function MonthlyChartLazy({ data }: { data: MonthPoint[] }) {
  return <Chart data={data} />;
}

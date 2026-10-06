"use client";

import dynamic from "next/dynamic";

/** Recharts pesa: los gráficos de Inicio se cargan aparte, con un esqueleto del mismo alto. */
export const KpiChartLazy = dynamic(() => import("./kpi-chart"), { ssr: false, loading: () => <div className="skeleton h-14 w-full" aria-hidden /> });
export const FinanceChartLazy = dynamic(() => import("./finance-chart"), { ssr: false, loading: () => <div className="skeleton h-60 w-full" aria-hidden /> });

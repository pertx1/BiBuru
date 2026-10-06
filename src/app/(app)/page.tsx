import { Suspense } from "react";
import { HomeGrid } from "@/components/home/home-grid";
import { PeriodBar } from "@/components/home/period-bar";
import { WIDGET_COMPONENTS } from "@/components/home/registry";
import type { HomeCtx } from "@/components/home/types";
import { WidgetBoundary } from "@/components/home/widget-boundary";
import { WidgetSkeleton } from "@/components/home/widget-card";
import { BudgetBanner } from "@/components/ai/budget-banner";
import { listBusinesses } from "@/lib/data";
import { parseHomePeriod, WIDGET_BY_TYPE } from "@/lib/home/layout";
import { homeRange } from "@/lib/home/period";
import { getUiPrefs } from "@/lib/home/prefs";
import { getNow } from "@/lib/tasks/data";

export const metadata = { title: "Inicio" };

/** Inicio: rejilla de widgets configurable. Cada widget carga sus datos por separado (Suspense) y aislado (si falla, no rompe los demás). */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ periodo?: string; comparar?: string }> }) {
  const sp = await searchParams;
  const [{ layout }, now, businesses] = await Promise.all([getUiPrefs(), getNow(), listBusinesses()]);
  const periodKey = parseHomePeriod(sp.periodo);
  const ctx: HomeCtx = {
    range: homeRange(periodKey, now.date), periodKey, compare: sp.comparar !== "0", today: now.date,
    businesses: businesses.map((b) => ({ id: b.id, name: b.name, color: b.color })),
  };
  const nodes = Object.fromEntries(layout.map((w) => {
    const Comp = WIDGET_COMPONENTS[w.type];
    const title = WIDGET_BY_TYPE.get(w.type)?.title ?? "Widget";
    return [w.id, Comp ? (
      <WidgetBoundary key={`${w.id}:${w.size}:${JSON.stringify(w.settings)}`} title={title}>
        <Suspense fallback={<WidgetSkeleton tall={w.size === "l"} />}><Comp w={w} ctx={ctx} /></Suspense>
      </WidgetBoundary>
    ) : null];
  }));
  const dateLabel = new Date(`${now.date}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return (
    <div className="flex flex-col gap-3">
      <BudgetBanner />
      <HomeGrid layout={layout} nodes={nodes} businesses={ctx.businesses} dateLabel={dateLabel} toolbar={<PeriodBar period={periodKey} compare={ctx.compare} />} />
    </div>
  );
}

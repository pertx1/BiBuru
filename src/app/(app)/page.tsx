import { HomeGrid } from "@/components/home/home-grid";
import { PeriodBar } from "@/components/home/period-bar";
import { renderWidgetNodes } from "@/components/home/render-nodes";
import type { HomeCtx } from "@/components/home/types";
import { BudgetBanner } from "@/components/ai/budget-banner";
import { listBusinesses } from "@/lib/data";
import { parseHomePeriod } from "@/lib/home/layout";
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
    businesses: businesses.map((b) => ({ id: b.id, name: b.name, color: b.color, production: b.production_enabled })),
  };
  const nodes = renderWidgetNodes(layout, ctx);
  const dateLabel = new Date(`${now.date}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return (
    <div className="flex flex-col gap-3">
      <BudgetBanner />
      <HomeGrid layout={layout} nodes={nodes} businesses={ctx.businesses} dateLabel={dateLabel} toolbar={<PeriodBar period={periodKey} compare={ctx.compare} />} />
    </div>
  );
}

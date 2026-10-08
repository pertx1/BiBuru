import { notFound } from "next/navigation";
import { ArchiveButton } from "@/components/businesses/archive-button";
import { HomeGrid } from "@/components/home/home-grid";
import { PeriodBar } from "@/components/home/period-bar";
import { renderWidgetNodes } from "@/components/home/render-nodes";
import type { HomeCtx } from "@/components/home/types";
import { getBusiness, listBusinesses } from "@/lib/data";
import { parseHomePeriod, withBusiness } from "@/lib/home/layout";
import { homeRange } from "@/lib/home/period";
import { getBusinessLayout } from "@/lib/home/prefs";
import { getNow } from "@/lib/tasks/data";

export const metadata = { title: "Resumen del negocio" };

/**
 * Resumen del negocio: el mismo sistema de widgets que Inicio (editar, añadir, quitar, mover, tamaño y ajustes), con su propia
 * disposición guardada por negocio y «Restablecer». Todos los widgets usan este negocio.
 */
export default async function ResumenPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ periodo?: string; comparar?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [business, now, businesses] = await Promise.all([getBusiness(id), getNow(), listBusinesses()]);
  if (!business) notFound();
  const { layout } = await getBusinessLayout(id, business.production_enabled);
  const periodKey = parseHomePeriod(sp.periodo);
  const ctx: HomeCtx = {
    range: homeRange(periodKey, now.date), periodKey, compare: sp.comparar !== "0", today: now.date,
    businesses: (businesses.some((b) => b.id === id) ? businesses : [...businesses, business]).map((b) => ({ id: b.id, name: b.name, color: b.color, production: b.production_enabled })),
  };
  const nodes = renderWidgetNodes(layout, ctx, (w) => withBusiness(w, id));
  return (
    <div className="flex flex-col gap-5">
      <HomeGrid layout={layout} nodes={nodes} businesses={ctx.businesses} businessId={id} dateLabel="Resumen"
        toolbar={<PeriodBar period={periodKey} compare={ctx.compare} basePath={`/negocios/${id}`} />} />
      <div className="flex justify-end"><ArchiveButton id={business.id} archived={business.archived} /></div>
    </div>
  );
}

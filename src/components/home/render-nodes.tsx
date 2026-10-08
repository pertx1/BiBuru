import { Suspense, type ReactNode } from "react";
import { WIDGET_BY_TYPE, type WidgetInstance } from "@/lib/home/layout";
import { WIDGET_COMPONENTS } from "./registry";
import type { HomeCtx } from "./types";
import { WidgetBoundary } from "./widget-boundary";
import { WidgetSkeleton } from "./widget-card";

/** Cada widget por separado (Suspense) y aislado (si falla, no rompe los demás). Inicio y el Resumen de cada negocio. */
export function renderWidgetNodes(layout: WidgetInstance[], ctx: HomeCtx, prepare: (w: WidgetInstance) => WidgetInstance = (w) => w): Record<string, ReactNode> {
  return Object.fromEntries(layout.map((raw) => {
    const w = prepare(raw);
    const Comp = WIDGET_COMPONENTS[w.type];
    const title = WIDGET_BY_TYPE.get(w.type)?.title ?? "Widget";
    return [w.id, Comp ? (
      <WidgetBoundary key={`${w.id}:${w.size}:${JSON.stringify(w.settings)}`} title={title}>
        <Suspense fallback={<WidgetSkeleton tall={w.size === "l"} />}><Comp w={w} ctx={ctx} /></Suspense>
      </WidgetBoundary>
    ) : null];
  }));
}

import type { HomePeriodKey, WidgetInstance } from "@/lib/home/layout";
import type { HomeRange } from "@/lib/home/period";

export type BizOption = { id: string; name: string; color: string; production?: boolean };
/** Contexto común que reciben todos los widgets (periodo elegido arriba, hoy y negocios). */
export type HomeCtx = { range: HomeRange; periodKey: HomePeriodKey; compare: boolean; today: string; businesses: BizOption[] };
export type WidgetProps = { w: WidgetInstance; ctx: HomeCtx };

/** Negocio elegido en los ajustes del widget (undefined = todos). Ignora ids que ya no existen. */
export const businessOf = (w: WidgetInstance, ctx: HomeCtx) => ctx.businesses.find((b) => b.id === w.settings.business);

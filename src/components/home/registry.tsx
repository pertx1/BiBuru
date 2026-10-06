import type { ComponentType } from "react";
import { FinanceSummaryWidget } from "./widgets/finance-summary";
import { ProfitWidget, SalesWidget } from "./widgets/kpi";
import { AgendaTodayWidget, GoalsActiveWidget, InboxWidget, QuickCaptureWidget, TasksTodayWidget, VideosToWatchWidget } from "./widgets/simple";
import type { WidgetProps } from "./types";

/**
 * Componente de cada tipo de widget (los metadatos están en `src/lib/home/layout.ts`).
 * Añadir un widget = crear su componente y darlo de alta aquí y en WIDGETS. Cada uno carga sus propios datos.
 */
export const WIDGET_COMPONENTS: Record<string, ComponentType<WidgetProps>> = {
  "finance-summary": FinanceSummaryWidget,
  sales: SalesWidget,
  profit: ProfitWidget,
  "tasks-today": TasksTodayWidget,
  "agenda-today": AgendaTodayWidget,
  "quick-capture": QuickCaptureWidget,
  "goals-active": GoalsActiveWidget,
  inbox: InboxWidget,
  "videos-to-watch": VideosToWatchWidget,
};

/**
 * Inicio personalizable: catálogo de widgets (metadatos puros, válidos en cliente y servidor),
 * disposición por defecto y normalización de lo guardado en `user_ui_prefs.home_widgets`.
 * Para añadir un widget: darlo de alta aquí (WIDGETS) y su componente en `src/components/home/registry.tsx`.
 */
import { z } from "zod";

export type WidgetSize = "s" | "m" | "l";
export type WidgetGroup = "negocios" | "tareas" | "calendario" | "objetivos" | "captura" | "favoritos" | "ia";
export type PreviewKind = "finance" | "line" | "number" | "list" | "ring" | "bars" | "input" | "agenda";

/** Ajustes editables de un widget (el formulario de ajustes se genera a partir de esto). */
export type SettingField =
  | { key: string; label: string; kind: "business"; allowAll: boolean }
  | { key: string; label: string; kind: "choice"; options: { value: string; label: string }[] };

export type WidgetMeta = {
  type: string;
  group: WidgetGroup;
  title: string;
  description: string;
  sizes: WidgetSize[];
  defaultSize: WidgetSize;
  preview: PreviewKind;
  fields: SettingField[];
  defaults: Record<string, string>;
};

export const GROUP_LABELS: Record<WidgetGroup, string> = {
  negocios: "Negocios", tareas: "Tareas", calendario: "Calendario", objetivos: "Objetivos",
  captura: "Captura y notas", favoritos: "Favoritos", ia: "IA",
};

export const SIZE_LABELS: Record<WidgetSize, string> = { s: "Pequeño", m: "Mediano", l: "Grande" };

const business = (allowAll = true): SettingField => ({ key: "business", label: "Negocio", kind: "business", allowAll });

export const WIDGETS: WidgetMeta[] = [
  {
    type: "finance-summary", group: "negocios", title: "Resumen financiero", preview: "finance",
    description: "Ingresos, gastos y beneficio totales, con el gráfico de los últimos meses.",
    sizes: ["l"], defaultSize: "l",
    fields: [business(), { key: "months", label: "Meses del gráfico", kind: "choice", options: [{ value: "3", label: "3 meses" }, { value: "6", label: "6 meses" }, { value: "12", label: "12 meses" }] }],
    defaults: { business: "all", months: "6" },
  },
  {
    type: "sales", group: "negocios", title: "Ventas del periodo", preview: "line",
    description: "Ventas del periodo elegido arriba, comparadas con el anterior.",
    sizes: ["s", "m", "l"], defaultSize: "m", fields: [business()], defaults: { business: "all" },
  },
  {
    type: "profit", group: "negocios", title: "Beneficio y margen", preview: "line",
    description: "Beneficio del periodo, su margen y la comparación con el anterior.",
    sizes: ["s", "m", "l"], defaultSize: "m", fields: [business()], defaults: { business: "all" },
  },
  {
    type: "tasks-today", group: "tareas", title: "Tareas de hoy", preview: "list",
    description: "Lo que toca hoy y lo atrasado. Se pueden marcar desde aquí.",
    sizes: ["m", "l"], defaultSize: "m", fields: [], defaults: {},
  },
  {
    type: "agenda-today", group: "calendario", title: "Agenda de hoy", preview: "agenda",
    description: "Los eventos de hoy, por hora.",
    sizes: ["s", "m"], defaultSize: "s", fields: [], defaults: {},
  },
  {
    type: "quick-capture", group: "captura", title: "Captura rápida", preview: "input",
    description: "Apunta una idea, tarea, gasto o enlace en segundos (también con voz).",
    sizes: ["m", "l"], defaultSize: "m", fields: [], defaults: {},
  },
  {
    type: "goals-active", group: "objetivos", title: "Objetivos activos", preview: "bars",
    description: "Tus objetivos activos con su barra de progreso.",
    sizes: ["m", "l"], defaultSize: "m", fields: [business()], defaults: { business: "all" },
  },
  {
    type: "inbox", group: "captura", title: "Bandeja de entrada", preview: "number",
    description: "Capturas pendientes de revisar.",
    sizes: ["s", "m"], defaultSize: "s", fields: [], defaults: {},
  },
  {
    type: "videos-to-watch", group: "favoritos", title: "Vídeos por ver", preview: "list",
    description: "Los últimos vídeos guardados que aún no has visto.",
    sizes: ["s", "m"], defaultSize: "s", fields: [], defaults: {},
  },
];

export const WIDGET_BY_TYPE = new Map(WIDGETS.map((w) => [w.type, w]));

export type WidgetInstance = { id: string; type: string; size: WidgetSize; settings: Record<string, string> };

export const MAX_WIDGETS = 40;

const instanceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{4,40}$/i),
  type: z.string().max(40),
  size: z.enum(["s", "m", "l"]),
  settings: z.record(z.string().max(40), z.string().max(80)).default({}),
});
export const layoutSchema = z.array(instanceSchema).max(MAX_WIDGETS);

/** Disposición por defecto (el Resumen financiero siempre el primero). */
export const DEFAULT_LAYOUT: WidgetInstance[] = [
  "finance-summary", "tasks-today", "quick-capture", "agenda-today", "inbox", "sales", "profit", "goals-active", "videos-to-watch",
].map((type, i) => {
  const m = WIDGET_BY_TYPE.get(type)!;
  return { id: `def-${i + 1}`, type, size: m.defaultSize, settings: { ...m.defaults } };
});

/** Ajustes válidos para el widget: rellena los que falten y descarta los desconocidos o fuera de rango. */
export function cleanSettings(meta: WidgetMeta, raw: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of meta.fields) {
    const v = raw?.[f.key];
    let ok = typeof v === "string";
    if (ok && f.kind === "choice") ok = f.options.some((o) => o.value === v);
    if (ok && f.kind === "business") ok = (v === "all" && f.allowAll) || /^[0-9a-f-]{36}$/i.test(v as string);
    out[f.key] = ok ? (v as string) : (meta.defaults[f.key] ?? "");
  }
  return out;
}

/**
 * Convierte lo guardado (o null) en una disposición válida: sin tipos desconocidos, sin ids repetidos,
 * tamaños permitidos y ajustes completos. Nunca lanza: si algo está mal se queda la parte buena.
 */
export function normalizeLayout(raw: unknown): WidgetInstance[] {
  if (raw == null) return DEFAULT_LAYOUT.map((w) => ({ ...w, settings: { ...w.settings } }));
  if (!Array.isArray(raw)) return normalizeLayout(null);
  const seen = new Set<string>();
  const out: WidgetInstance[] = [];
  for (const item of raw.slice(0, MAX_WIDGETS)) {
    const p = instanceSchema.safeParse(item);
    if (!p.success) continue;
    const meta = WIDGET_BY_TYPE.get(p.data.type);
    if (!meta || seen.has(p.data.id)) continue;
    seen.add(p.data.id);
    out.push({ id: p.data.id, type: meta.type, size: meta.sizes.includes(p.data.size) ? p.data.size : meta.defaultSize, settings: cleanSettings(meta, p.data.settings) });
  }
  return out;
}

/** Instancia nueva de un widget del catálogo, con id aleatorio. */
export function newInstance(type: string, id: string): WidgetInstance | null {
  const meta = WIDGET_BY_TYPE.get(type);
  return meta ? { id, type, size: meta.defaultSize, settings: { ...meta.defaults } } : null;
}

/** Clases de rejilla: 2 columnas en móvil, 4 en escritorio. */
export const SIZE_CLASSES: Record<WidgetSize, string> = {
  s: "col-span-1",
  m: "col-span-2",
  l: "col-span-2 md:col-span-4",
};

// ------------------------------------------------------------------ periodo común de Inicio
export type HomePeriodKey = "hoy" | "7d" | "30d" | "mes" | "ano";
export const HOME_PERIODS: { key: HomePeriodKey; label: string }[] = [
  { key: "hoy", label: "Hoy" }, { key: "7d", label: "7 días" }, { key: "30d", label: "30 días" }, { key: "mes", label: "Este mes" }, { key: "ano", label: "Este año" },
];
export const parseHomePeriod = (v: string | undefined): HomePeriodKey => (HOME_PERIODS.some((p) => p.key === v) ? (v as HomePeriodKey) : "30d");

/**
 * Inicio personalizable: catálogo de widgets (metadatos puros, válidos en cliente y servidor),
 * disposición por defecto y normalización de lo guardado en `user_ui_prefs.home_widgets`.
 * Para añadir un widget: darlo de alta aquí (WIDGETS) y su componente en `src/components/home/registry.tsx`.
 */
import { z } from "zod";

export type WidgetSize = "s" | "m" | "l";
export type WidgetGroup = "negocios" | "tareas" | "calendario" | "objetivos" | "captura" | "favoritos" | "noticias" | "ia";
export type PreviewKind = "finance" | "line" | "number" | "list" | "ring" | "bars" | "input" | "agenda" | "calendar" | "text";

/** Ajustes editables de un widget (el formulario de ajustes se genera a partir de esto). */
export type SettingField =
  | { key: string; label: string; kind: "business"; allowAll: boolean }
  | { key: string; label: string; kind: "choice"; options: { value: string; label: string }[] }
  /** Elemento del usuario (objetivo, carpeta, categoría de vídeos). "" = automático / sin elegir. */
  | { key: string; label: string; kind: "goal" | "folder" | "category"; emptyLabel: string };

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
  captura: "Captura y notas", favoritos: "Favoritos", noticias: "Noticias", ia: "IA",
};

export const SIZE_LABELS: Record<WidgetSize, string> = { s: "Pequeño", m: "Mediano", l: "Grande" };

const business = (allowAll = true): SettingField => ({ key: "business", label: "Negocio", kind: "business", allowAll });
const goal = (emptyLabel: string): SettingField => ({ key: "goal", label: "Objetivo", kind: "goal", emptyLabel });
const w = (type: string, group: WidgetGroup, title: string, description: string, preview: PreviewKind, sizes: WidgetSize[], fields: SettingField[] = [], defaults: Record<string, string> = {}): WidgetMeta =>
  ({ type, group, title, description, preview, sizes, defaultSize: sizes[0], fields, defaults: Object.fromEntries(fields.map((f) => [f.key, defaults[f.key] ?? (f.kind === "business" && f.allowAll ? "all" : "")])) });

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
  // ---------------------------------------------------------------- tanda 2
  w("expenses-category", "negocios", "Gastos por categoría", "En qué se va el dinero en el periodo elegido arriba.", "bars", ["m", "l"], [business()]),
  w("orders", "negocios", "Pedidos", "Pedidos pendientes de enviar o los últimos pedidos.", "list", ["m", "l"],
    [business(), { key: "show", label: "Mostrar", kind: "choice", options: [{ value: "pending", label: "Pendientes" }, { value: "latest", label: "Últimos" }] }], { show: "pending" }),
  w("pending-receivables", "negocios", "Pendiente de cobro", "Cuánto te deben, en cuántos pedidos y quién (de un negocio o de todos).", "number", ["m", "s", "l"], [business()]),
  w("business-compare", "negocios", "Comparativa entre negocios", "Ventas y beneficio de cada negocio en el periodo, frente al anterior.", "bars", ["m", "l"]),
  w("tasks-overdue", "tareas", "Atrasadas", "Tareas que se pasaron de fecha.", "list", ["m", "l", "s"]),
  w("tasks-week", "tareas", "Próximos 7 días", "Lo que viene esta semana, día a día.", "list", ["m", "l"]),
  w("tasks-business", "tareas", "Tareas de un negocio", "Tareas abiertas de un negocio concreto.", "list", ["m", "l"], [business(false)]),
  w("tasks-done-week", "tareas", "Completadas esta semana", "Cuántas tareas has terminado cada día (de lunes a domingo).", "bars", ["s", "m"]),
  w("next-event", "calendario", "Próximo evento", "El siguiente evento con cuenta atrás.", "agenda", ["s", "m"]),
  w("month-calendar", "calendario", "Calendario del mes", "Mini calendario con los días que tienen algo.", "calendar", ["m", "l"]),
  w("week-glance", "calendario", "Semana de un vistazo", "Eventos y tareas de lunes a domingo.", "calendar", ["m", "l"]),
  w("goal-ring", "objetivos", "Progreso de un objetivo", "Anillo con el avance de un objetivo.", "ring", ["s", "m"], [goal("El más avanzado")]),
  w("goal-deadline", "objetivos", "Objetivo más urgente", "El objetivo activo con la fecha límite más cercana.", "ring", ["s", "m"]),
  w("goal-trend", "objetivos", "Evolución de un objetivo", "Línea con el histórico de un objetivo.", "line", ["m", "l"], [goal("El primero activo")]),
  w("notes-pinned", "captura", "Notas fijadas", "Tus notas fijadas, a mano.", "list", ["m", "l", "s"]),
  w("notes-recent", "captura", "Últimas notas", "Las notas editadas más recientemente.", "list", ["m", "l", "s"]),
  w("folder-shortcut", "captura", "Carpeta", "Acceso directo a una carpeta de notas.", "number", ["s", "m"], [{ key: "folder", label: "Carpeta", kind: "folder", emptyLabel: "Elige una carpeta" }]),
  w("videos-top", "favoritos", "Más útiles", "Vídeos con utilidad 4–5 que aún no has archivado.", "list", ["m", "l", "s"]),
  w("video-ideas", "favoritos", "Ideas sin convertir", "Ideas accionables de tus vídeos que aún no son tareas.", "list", ["m", "l"]),
  w("videos-recent", "favoritos", "Últimos guardados", "Los últimos vídeos que has guardado.", "list", ["m", "l", "s"]),
  w("videos-category", "favoritos", "Vídeos por categoría", "Cuántos vídeos tienes en cada categoría.", "bars", ["s", "m"], [{ key: "category", label: "Categoría", kind: "category", emptyLabel: "Todas (recuento)" }]),
  w("news-today", "noticias", "Noticias de hoy", "El resumen de noticias útiles de hoy, con la foto de la principal.", "finance", ["m", "l"]),
  w("news-idea", "noticias", "Idea del día", "Una acción para ganar más o escalar, sacada de las noticias de hoy.", "text", ["m", "l", "s"]),
  w("news-business", "noticias", "Noticias de un negocio", "Las noticias de hoy que aplican a un negocio concreto.", "list", ["m", "l"], [business(false)]),
  w("ai-ask", "ia", "Preguntar al asistente", "Escribe una pregunta y se abre el chat con la respuesta.", "input", ["m", "l"]),
  w("ai-brief", "ia", "Resumen del día", "La IA resume tu día una vez por la mañana (se guarda para no gastar de más).", "text", ["m", "l"]),
  w("ai-usage", "ia", "Consumo de IA", "Gasto de IA del mes frente a tu presupuesto.", "ring", ["s", "m"]),
  w("ai-suggest", "ia", "¿Qué hago ahora?", "La IA te sugiere la siguiente acción (al pulsar; se reutiliza unas horas).", "text", ["m", "l"]),
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
  "finance-summary", "tasks-today", "news-today", "quick-capture", "agenda-today", "inbox", "sales", "profit", "goals-active", "videos-to-watch",
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
    if (ok && (f.kind === "goal" || f.kind === "folder" || f.kind === "category")) ok = v === "" || /^[0-9a-f-]{36}$/i.test(v as string);
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

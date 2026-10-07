/**
 * Barra inferior personalizable: hasta 5 secciones elegidas (en orden) + «Más» siempre al final.
 * El botón + de captura en el centro es opcional (`show_capture_button`, apagado por defecto); con él caben 4 secciones.
 * Se guarda en `user_ui_prefs.mobile_tabs` (null = por defecto).
 */
export type SectionKey = "inicio" | "tareas" | "negocios" | "calendario" | "objetivos" | "noticias" | "correo" | "redes" | "notas" | "favoritos" | "bandeja" | "chat" | "ajustes";

export const SECTIONS: { key: SectionKey; href: string; label: string; long: string }[] = [
  { key: "inicio", href: "/", label: "Inicio", long: "Inicio" },
  { key: "tareas", href: "/tareas", label: "Tareas", long: "Tareas" },
  { key: "negocios", href: "/negocios", label: "Negocios", long: "Negocios" },
  { key: "calendario", href: "/calendario", label: "Calendario", long: "Calendario" },
  { key: "objetivos", href: "/objetivos", label: "Objetivos", long: "Objetivos" },
  { key: "noticias", href: "/noticias", label: "Noticias", long: "Noticias" },
  { key: "correo", href: "/correo", label: "Correo", long: "Correo (Outlook)" },
  { key: "redes", href: "/redes", label: "Redes", long: "Redes (Instagram y TikTok)" },
  { key: "notas", href: "/notas", label: "Notas", long: "Notas" },
  { key: "favoritos", href: "/favoritos", label: "Favoritos", long: "Favoritos" },
  { key: "bandeja", href: "/bandeja", label: "Bandeja", long: "Bandeja de entrada" },
  { key: "chat", href: "/chat", label: "Asistente", long: "Asistente (chat con IA)" },
  { key: "ajustes", href: "/ajustes", label: "Ajustes", long: "Ajustes" },
];
export const SECTION_BY_KEY = new Map(SECTIONS.map((s) => [s.key, s]));

export const MAX_TABS = 5;
export const MAX_TABS_WITH_CAPTURE = 4;
export const maxTabs = (showCapture: boolean) => (showCapture ? MAX_TABS_WITH_CAPTURE : MAX_TABS);
export const DEFAULT_TABS: SectionKey[] = ["inicio", "tareas", "negocios"];

/** Lista válida: claves conocidas, sin repetir, como mucho `max` (5, o 4 con el botón +). Vacía o inválida = la de por defecto. */
export function normalizeTabs(raw: unknown, max: number = MAX_TABS): SectionKey[] {
  if (!Array.isArray(raw)) return [...DEFAULT_TABS];
  const out: SectionKey[] = [];
  for (const k of raw) if (typeof k === "string" && SECTION_BY_KEY.has(k as SectionKey) && !out.includes(k as SectionKey)) out.push(k as SectionKey);
  return out.length ? out.slice(0, max) : [...DEFAULT_TABS];
}

/** Lo que va en «Más»: todo lo que no está en la barra (Ajustes siempre, para no perderlo). */
export function moreSections(tabs: SectionKey[]) {
  return SECTIONS.filter((s) => !tabs.includes(s.key) || s.key === "ajustes");
}

/** Reparto alrededor del botón + (si se muestra): con la pestaña «Más» incluida, la mitad (redondeando a la baja) a la izquierda. */
export function splitTabs<T>(items: T[]): { left: T[]; right: T[] } {
  const half = Math.floor(items.length / 2);
  return { left: items.slice(0, half), right: items.slice(half) };
}

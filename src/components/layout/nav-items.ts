import {
  Briefcase, CalendarDays, CheckSquare, Home, Inbox, MoreHorizontal, Newspaper, Sparkles, NotebookText, Settings, Target, Video,
  type LucideIcon,
} from "lucide-react";

import { SECTION_BY_KEY, type SectionKey } from "@/lib/home/nav";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** Barra lateral de escritorio: todas las secciones. */
export const sidebarItems: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/chat", label: "Asistente", icon: Sparkles },
  { href: "/bandeja", label: "Bandeja", icon: Inbox },
  { href: "/tareas", label: "Tareas", icon: CheckSquare },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/negocios", label: "Negocios", icon: Briefcase },
  { href: "/objetivos", label: "Objetivos", icon: Target },
  { href: "/noticias", label: "Noticias", icon: Newspaper },
  { href: "/notas", label: "Notas", icon: NotebookText },
  { href: "/favoritos", label: "Favoritos", icon: Video },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

/** Icono de cada sección (la barra inferior se elige en Ajustes → Navegación, ver `src/lib/home/nav.ts`). */
export const SECTION_ICONS: Record<SectionKey, LucideIcon> = {
  inicio: Home, tareas: CheckSquare, negocios: Briefcase, calendario: CalendarDays, objetivos: Target, noticias: Newspaper,
  notas: NotebookText, favoritos: Video, bandeja: Inbox, chat: Sparkles, ajustes: Settings,
};

/** Pestañas de la barra inferior: las elegidas + «Más» siempre al final. */
export function mobileTabItems(tabs: SectionKey[]): NavItem[] {
  return [
    ...tabs.map((k) => { const s = SECTION_BY_KEY.get(k)!; return { href: s.href, label: s.label, icon: SECTION_ICONS[k] }; }),
    { href: "/mas", label: "Más", icon: MoreHorizontal },
  ];
}

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

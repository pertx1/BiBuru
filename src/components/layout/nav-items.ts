import {
  Briefcase, CalendarDays, CheckSquare, Home, Inbox, MoreHorizontal, Sparkles, NotebookText, Settings, Target, Video,
  type LucideIcon,
} from "lucide-react";

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
  { href: "/notas", label: "Notas", icon: NotebookText },
  { href: "/favoritos", label: "Favoritos", icon: Video },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

/** Barra inferior de móvil (el botón de captura va en el centro). */
export const tabsLeft: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/tareas", label: "Tareas", icon: CheckSquare },
];
export const tabsRight: NavItem[] = [
  { href: "/negocios", label: "Negocios", icon: Briefcase },
  { href: "/mas", label: "Más", icon: MoreHorizontal },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

import Link from "next/link";
import { CalendarDays, Inbox, Sparkles, ChevronRight, NotebookText, Settings, Target, Video } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Más" };

const items = [
  { href: "/chat", label: "Asistente (chat con IA)", icon: Sparkles },
  { href: "/bandeja", label: "Bandeja de entrada", icon: Inbox },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/objetivos", label: "Objetivos", icon: Target },
  { href: "/notas", label: "Notas", icon: NotebookText },
  { href: "/favoritos", label: "Favoritos", icon: Video },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

export default function MasPage() {
  return (
    <>
      <PageHeader title="Más" />
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {items.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-12 items-center gap-3 px-4 hover:bg-surface-2">
              <Icon className="size-5 text-muted" aria-hidden />
              <span className="flex-1 text-sm font-medium">{label}</span>
              <ChevronRight className="size-4 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

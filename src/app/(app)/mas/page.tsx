import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SECTION_ICONS } from "@/components/layout/nav-items";
import { moreSections } from "@/lib/home/nav";
import { getUiPrefs } from "@/lib/home/prefs";

export const metadata = { title: "Más" };

/** Todo lo que no está en la barra inferior (se elige en Ajustes → Navegación). */
export default async function MasPage() {
  const { tabs } = await getUiPrefs();
  return (
    <>
      <PageHeader title="Más" />
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {moreSections(tabs).map((s) => {
          const Icon = SECTION_ICONS[s.key];
          return (
            <li key={s.key}>
              <Link href={s.href} className="flex min-h-12 items-center gap-3 px-4 hover:bg-surface-2">
                <Icon className="size-5 text-muted" aria-hidden />
                <span className="flex-1 text-sm font-medium">{s.long}</span>
                <ChevronRight className="size-4 text-muted" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

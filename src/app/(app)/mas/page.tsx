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
      <ul className="overflow-hidden rounded-xl bg-surface">
        {moreSections(tabs).map((s) => {
          const Icon = SECTION_ICONS[s.key];
          return (
            <li key={s.key}>
              <Link href={s.href} className="flex min-h-12 items-center gap-3.5 pl-4 active:bg-fill md:hover:bg-fill">
                <Icon className="size-[1.375rem] text-accent" aria-hidden />
                {/* Separador iOS: empieza en el texto, no en el icono. */}
                <span className="flex min-h-12 flex-1 items-center gap-2 pr-4 text-[17px] [li+li_&]:shadow-[inset_0_1px_0_var(--border)]">
                  <span className="flex-1">{s.long}</span>
                  <ChevronRight className="size-4 text-muted/70" aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

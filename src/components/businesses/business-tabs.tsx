"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { slug: "", label: "Resumen" },
  { slug: "pedidos", label: "Pedidos" },
  { slug: "gastos", label: "Gastos" },
  { slug: "ingresos", label: "Ingresos" },
  { slug: "productos", label: "Productos" },
  { slug: "stock", label: "Stock" },
  { slug: "estadisticas", label: "Estadísticas" },
  { slug: "tareas", label: "Tareas" },
  { slug: "objetivos", label: "Objetivos" },
];

export function BusinessTabs({ id, production }: { id: string; production?: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones del negocio" className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 md:mx-0 md:px-0">
      {[...TABS.slice(0, 6), ...(production ? [{ slug: "produccion", label: "Producción" }] : []), ...TABS.slice(6)].map((t) => {
        const href = `/negocios/${id}${t.slug ? `/${t.slug}` : ""}`;
        const active = t.slug === "" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={t.slug} href={href} aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-3 text-sm font-medium text-muted hover:text-foreground",
              active && "border-accent text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

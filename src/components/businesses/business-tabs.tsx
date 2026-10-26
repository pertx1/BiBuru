"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Tab = { slug: string; label: string; production?: boolean };

/**
 * Pestañas del negocio, en este orden. Bolsa imprenta, Facturas y Reglas Antola (antes dentro de Producción) salen si el
 * negocio tiene el módulo de producción. Ingresos, Producción, Tareas y Objetivos ya no son pestañas: sus direcciones
 * antiguas redirigen a su sitio nuevo (Estadísticas, Stock y las secciones Tareas y Objetivos filtradas por el negocio).
 * Mensajes (solo correo) se quitó con el correo: su dirección lleva al Resumen.
 */
const TABS: Tab[] = [
  { slug: "", label: "Resumen" },
  { slug: "pedidos", label: "Pedidos" },
  { slug: "gastos", label: "Gastos" },
  { slug: "stock", label: "Stock" },
  { slug: "bolsa", label: "Bolsa imprenta", production: true },
  { slug: "facturas", label: "Facturas", production: true },
  { slug: "reglas", label: "Reglas Antola", production: true },
  { slug: "redes", label: "Redes" },
  { slug: "estadisticas", label: "Estadísticas" },
  { slug: "productos", label: "Productos" },
];

export function BusinessTabs({ id, production }: { id: string; production?: boolean }) {
  const pathname = usePathname();
  return (
    // En móvil: una fila con desplazamiento horizontal.
    <nav aria-label="Secciones del negocio" className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      {TABS.filter((t) => !t.production || production).map((t) => {
        const href = `/negocios/${id}${t.slug ? `/${t.slug}` : ""}`;
        const active = t.slug === "" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={t.slug} href={href} aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-medium text-muted hover:text-foreground",
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

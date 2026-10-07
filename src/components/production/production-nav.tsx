"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { slug: "", label: "Stock" },
  { slug: "bolsa", label: "Bolsa imprenta" },
  { slug: "reglas", label: "Reglas y Antola" },
  { slug: "facturas", label: "Facturas" },
];

export function ProductionNav({ id }: { id: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Producción" className="mb-4 flex gap-1.5 overflow-x-auto">
      {ITEMS.map((i) => {
        const href = `/negocios/${id}/produccion${i.slug ? `/${i.slug}` : ""}`;
        const active = pathname === href;
        return (
          <Link key={i.slug} href={href} aria-current={active ? "page" : undefined}
            className={cn("flex min-h-11 md:min-h-10 shrink-0 items-center rounded-full border border-border px-3.5 text-sm", active ? "border-accent bg-accent text-accent-foreground" : "bg-surface hover:bg-surface-2")}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** En móvil los filtros quedan plegados tras «Buscar y filtrar» (abiertos si hay alguno activo); en escritorio siempre visibles. */
export function CollapsibleFilters({ active, children }: { active: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(active);
  return (
    <div className="rounded-xl border border-border bg-surface md:border-0 md:bg-transparent">
      <button type="button" aria-expanded={open} onClick={() => setOpen((x) => !x)} className="flex min-h-11 w-full items-center justify-between px-3 text-sm font-medium md:hidden">
        Buscar y filtrar{active ? " · activos" : ""}<ChevronDown className={cn("size-4 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <div className={cn("p-3 pt-0 md:block md:p-0", !open && "hidden")}>{children}</div>
    </div>
  );
}

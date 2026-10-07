"use client";

import { Search } from "lucide-react";
import { OPEN_SEARCH_EVENT } from "./search-palette";

/** Botón de búsqueda para móvil (en escritorio se usa Ctrl/Cmd+K o la barra lateral). */
export function SearchButton({ className }: { className?: string }) {
  return (
    <button type="button" aria-label="Buscar" onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))} className={className ?? "flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-foreground hover:bg-surface-2 md:hidden"}>
      <Search className="size-5" aria-hidden />
    </button>
  );
}

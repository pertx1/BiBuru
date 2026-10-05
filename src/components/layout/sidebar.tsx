"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActive, sidebarItems } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 border-r border-border bg-surface p-3 md:flex">
      <div className="flex items-center gap-2 px-2 py-1">
        <div className="flex size-7 items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-foreground">B</div>
        <span className="font-semibold tracking-tight">BiBuru</span>
      </div>
      <button
        type="button"
        disabled
        title="Búsqueda global: Fase 4"
        className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Buscar…</span>
        <kbd className="rounded border border-border px-1.5 text-xs">Ctrl K</kbd>
      </button>
      <nav className="flex flex-col gap-0.5" aria-label="Secciones">
        {sidebarItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(pathname, href) ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground",
              isActive(pathname, href) && "bg-surface-2 text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

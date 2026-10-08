"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { useCapture } from "@/components/capture/capture-provider";
import { OPEN_SEARCH_EVENT } from "@/components/search/search-palette";
import { cn } from "@/lib/utils";
import { isActive, sidebarItems } from "./nav-items";

export function Sidebar({ inboxCount, redesCount = 0 }: { inboxCount: number; redesCount?: number }) {
  const pathname = usePathname();
  const capture = useCapture();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 border-r border-border bg-surface p-3 md:flex">
      <div className="flex items-center gap-2 px-2 py-1">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático */}
        <img src="/brand/mascot.svg" alt="" width={32} height={32} className="size-8" />
        <span className="text-lg font-extrabold tracking-tight">BiBuru</span>
      </div>
      <button type="button" onClick={capture.open} className="flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90">
        <Plus className="size-4" aria-hidden /> Captura rápida
      </button>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
        className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted hover:bg-surface-2"
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
            <span className="flex-1">{label}</span>
            {href === "/bandeja" && inboxCount > 0 && <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-foreground">{inboxCount}</span>}
            {href === "/redes" && redesCount > 0 && <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-foreground" aria-label={`${redesCount} mensajes sin responder`}>{redesCount}</span>}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

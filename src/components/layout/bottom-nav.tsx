"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useCapture } from "@/components/capture/capture-provider";
import { cn } from "@/lib/utils";
import { splitTabs, type SectionKey } from "@/lib/home/nav";
import { isActive, mobileTabItems, type NavItem } from "./nav-items";

function Tab({ item, pathname, dot, pending }: { item: NavItem; pathname: string; dot?: boolean; pending?: number }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold text-foreground/80 transition-colors",
        active && "bg-fill text-accent",
      )}
    >
      <span className="relative"><item.icon className="size-[1.375rem]" strokeWidth={active ? 2.25 : 1.75} aria-hidden />{dot && <span className="absolute -right-1 -top-0.5 size-2 rounded-full bg-accent" aria-label="Hay capturas por revisar" />}
        {!!pending && <span className="absolute -right-2.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white" aria-label={`${pending} capturas sin enviar`}>{pending}</span>}</span>
      {item.label}
    </Link>
  );
}

/** Barra inferior del móvil: las secciones elegidas en Ajustes → Navegación + «Más»; el botón + central solo si se activa allí. */
export function BottomNav({ inboxCount, tabs, showCapture }: { inboxCount: number; tabs: SectionKey[]; showCapture: boolean }) {
  const pathname = usePathname();
  const { left: tabsLeft, right: tabsRight } = splitTabs(mobileTabItems(tabs));
  // El punto de «hay capturas» va en Bandeja si está en la barra; si no, en «Más».
  const dotOn = (href: string) => inboxCount > 0 && (href === "/bandeja" || (href === "/mas" && !tabs.includes("bandeja")));
  const capture = useCapture();
  return (
    <nav
      aria-label="Navegación principal"
      // Barra flotante de cristal (como la de iOS 26): solo la capa de navegación lleva el material.
      className="glass fixed inset-x-3 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 flex items-center gap-0.5 rounded-full p-1.5 md:hidden"
    >
      {!showCapture && mobileTabItems(tabs).map((i, n) => <Tab key={i.href} item={i} pathname={pathname} dot={dotOn(i.href)} pending={n === 0 ? capture.pending : 0} />)}
      {showCapture && tabsLeft.map((i) => <Tab key={i.href} item={i} pathname={pathname} dot={dotOn(i.href)} />)}
      {showCapture && <button
        type="button"
        onClick={capture.open}
        aria-label="Captura rápida"
        className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
      >
        <Plus className="size-7" aria-hidden />
        {capture.pending > 0 && <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white" aria-label={`${capture.pending} capturas sin enviar`}>{capture.pending}</span>}
      </button>}
      {showCapture && tabsRight.map((i) => <Tab key={i.href} item={i} pathname={pathname} dot={dotOn(i.href)} />)}
    </nav>
  );
}

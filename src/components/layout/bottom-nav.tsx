"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useCapture } from "@/components/capture/capture-provider";
import { cn } from "@/lib/utils";
import { splitTabs, type SectionKey } from "@/lib/home/nav";
import { isActive, mobileTabItems, type NavItem } from "./nav-items";

function Tab({ item, pathname, dot }: { item: NavItem; pathname: string; dot?: boolean }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted",
        active && "text-accent",
      )}
    >
      <span className="relative"><item.icon className="size-5" aria-hidden />{dot && <span className="absolute -right-1 -top-0.5 size-2 rounded-full bg-accent" aria-label="Hay capturas por revisar" />}</span>
      {item.label}
    </Link>
  );
}

export function BottomNav({ inboxCount, tabs }: { inboxCount: number; tabs: SectionKey[] }) {
  const pathname = usePathname();
  const { left: tabsLeft, right: tabsRight } = splitTabs(mobileTabItems(tabs));
  // El punto de «hay capturas» va en Bandeja si está en la barra; si no, en «Más».
  const dotOn = (href: string) => inboxCount > 0 && (href === "/bandeja" || (href === "/mas" && !tabs.includes("bandeja")));
  const capture = useCapture();
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center border-t border-border bg-surface/95 pb-safe backdrop-blur md:hidden"
    >
      {tabsLeft.map((i) => <Tab key={i.href} item={i} pathname={pathname} dot={dotOn(i.href)} />)}
      <button
        type="button"
        onClick={capture.open}
        aria-label="Captura rápida"
        className="relative -mt-5 flex size-14 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg"
      >
        <Plus className="size-7" aria-hidden />
        {capture.pending > 0 && <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white" aria-label={`${capture.pending} capturas sin enviar`}>{capture.pending}</span>}
      </button>
      {tabsRight.map((i) => <Tab key={i.href} item={i} pathname={pathname} dot={dotOn(i.href)} />)}
    </nav>
  );
}

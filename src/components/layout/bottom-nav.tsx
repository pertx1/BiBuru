"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActive, tabsLeft, tabsRight, type NavItem } from "./nav-items";

function Tab({ item, pathname }: { item: NavItem; pathname: string }) {
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
      <item.icon className="size-5" aria-hidden />
      {item.label}
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center border-t border-border bg-surface/95 pb-safe backdrop-blur md:hidden"
    >
      {tabsLeft.map((i) => <Tab key={i.href} item={i} pathname={pathname} />)}
      <Link
        href="/captura"
        aria-label="Captura rápida"
        className="-mt-5 flex size-14 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg"
      >
        <Plus className="size-7" aria-hidden />
      </Link>
      {tabsRight.map((i) => <Tab key={i.href} item={i} pathname={pathname} />)}
    </nav>
  );
}

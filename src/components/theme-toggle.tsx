"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const options = [
  { value: "system", label: "Sistema" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
];

const subscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return (
    <div role="radiogroup" aria-label="Tema" className="inline-flex rounded-lg border border-border bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={mounted && theme === o.value}
          onClick={() => setTheme(o.value)}
          className={cn(
            "min-h-10 rounded-md px-3 text-sm font-medium text-muted md:min-h-8",
            mounted && theme === o.value && "bg-surface-2 text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

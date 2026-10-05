import * as React from "react";
import { cn } from "@/lib/utils";

/** text-base evita el zoom automático de Safari en iOS al enfocar el campo. */
export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base placeholder:text-muted md:min-h-9 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

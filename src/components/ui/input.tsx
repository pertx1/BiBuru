import * as React from "react";
import { cn } from "@/lib/utils";

/** text-base evita el zoom automático de Safari en iOS al enfocar el campo. */
export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-lg border border-transparent bg-fill px-3 text-base placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50 md:min-h-9 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

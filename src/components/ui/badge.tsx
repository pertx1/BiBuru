import { cn } from "@/lib/utils";

export function Badge({
  children, color, className,
}: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs font-medium", className)}
    >
      {color && <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />}
      {children}
    </span>
  );
}

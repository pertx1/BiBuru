import { cn } from "@/lib/utils";

export function ProgressBar({ pct, color, className, label }: { pct: number; color?: string; className?: string; label?: string }) {
  return (
    <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Progreso"} className={cn("h-2 overflow-hidden rounded-full bg-surface-2", className)}>
      <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, backgroundColor: color ?? "var(--accent)" }} />
    </div>
  );
}

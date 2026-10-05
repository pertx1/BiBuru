import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <Icon className="size-8 text-muted" aria-hidden />
      <h2 className="text-base font-semibold">{title}</h2>
      {children && <p className="text-sm text-muted">{children}</p>}
    </div>
  );
}

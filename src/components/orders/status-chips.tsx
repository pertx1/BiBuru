import Link from "next/link";
import { ORDER_STATUS_COLOR, ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/**
 * Fila de botones por estado con su número de pedidos (como en PROFITY). Un toque filtra; otro toque en el activo lo quita.
 * Se combinan con los demás filtros (el número ya cuenta con ellos).
 */
export function StatusChips({ counts, statuses, current, hrefFor }: { counts: Record<string, number>; statuses: readonly OrderStatus[]; current: string | undefined; hrefFor: (status: string | null) => string }) {
  const total = statuses.reduce((s, x) => s + (counts[x] ?? 0), 0);
  return (
    <nav aria-label="Filtrar por estado" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
      <Link href={hrefFor(null)} scroll={false} aria-current={!current ? "page" : undefined}
        className={cn("flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium md:min-h-9", !current ? "bg-accent text-accent-foreground" : "bg-fill")}>
        Todos <span className="tabular-nums opacity-80">{total}</span>
      </Link>
      {statuses.map((s) => {
        const on = current === s;
        return (
          <Link key={s} href={hrefFor(on ? null : s)} scroll={false} aria-current={on ? "page" : undefined}
            className={cn("flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium md:min-h-9", on ? "text-white" : "bg-fill")}
            style={on ? { backgroundColor: ORDER_STATUS_COLOR[s] } : undefined}>
            {!on && <span className="size-2 rounded-full" style={{ backgroundColor: ORDER_STATUS_COLOR[s] }} aria-hidden />}
            {ORDER_STATUS_LABEL[s]} <span className="tabular-nums opacity-80">{counts[s] ?? 0}</span>
          </Link>
        );
      })}
    </nav>
  );
}

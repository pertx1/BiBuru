import Link from "next/link";
import { formatEUR } from "@/lib/money";
import { listDueOrders } from "@/lib/orders/data";
import { debtors, receivables } from "@/lib/orders/payments";
import { WidgetCard } from "../widget-card";
import { businessOf, type WidgetProps } from "../types";

/** «Pendiente de cobro»: lo que me deben (pedidos revisados con algo sin cobrar), quién y desde cuándo. */
export async function PendingReceivablesWidget({ w, ctx }: WidgetProps) {
  const biz = businessOf(w, ctx);
  const due = await listDueOrders(biz?.id);
  const r = receivables(due, ctx.today);
  const who = debtors(due, ctx.today).slice(0, w.size === "l" ? 6 : 3);
  const href = biz ? `/negocios/${biz.id}/pedidos?vista=deudas` : ctx.businesses[0] ? `/negocios/${ctx.businesses[0].id}/pedidos?vista=deudas` : "/negocios";
  return (
    <WidgetCard title={`Pendiente de cobro${biz ? ` · ${biz.name}` : ""}`} href={href}>
      <p className={`text-[1.65rem] font-bold tabular-nums ${r.totalCents > 0 ? "text-bad" : ""}`}>{formatEUR(r.totalCents)}</p>
      <p className="text-xs text-muted">{r.count === 0 ? "Nadie te debe nada. 🎉" : `${r.count} ${r.count === 1 ? "pedido" : "pedidos"} · el más antiguo de hace ${r.oldestDays} ${r.oldestDays === 1 ? "día" : "días"}`}</p>
      {w.size !== "s" && who.length > 0 && (
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {who.map((d) => (
            <li key={d.key}>
              <Link href={href} className="flex min-h-11 items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{d.customer}</span>
                <span className="shrink-0 text-xs text-muted">{d.oldestDays} d</span>
                <span className="w-20 shrink-0 text-right tabular-nums">{formatEUR(d.dueCents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

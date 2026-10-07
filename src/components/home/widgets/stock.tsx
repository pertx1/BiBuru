import Link from "next/link";
import { loadInventory } from "@/lib/stock/service";
import { shortages } from "@/lib/stock/shortage";
import { WidgetCard } from "../widget-card";
import { businessOf, type WidgetProps } from "../types";

/** «Stock que falta»: lo que hay que reponer (pedidos pendientes sin cubrir o bajo el mínimo), de uno o de todos los negocios. */
export async function StockMissingWidget({ w, ctx }: WidgetProps) {
  const biz = businessOf(w, ctx);
  const targets = biz ? [biz] : ctx.businesses;
  const all = (await Promise.all(targets.map(async (b) => shortages((await loadInventory(b.id)).lines).map((l) => ({ ...l, biz: b }))))).flat();
  const shown = all.slice(0, w.size === "l" ? 8 : w.size === "s" ? 0 : 4);
  const href = biz ? `/negocios/${biz.id}/stock` : targets[0] ? `/negocios/${targets[0].id}/stock` : "/negocios";
  return (
    <WidgetCard title={`Stock que falta${biz ? ` · ${biz.name}` : ""}`} href={href}>
      <p className={`text-[1.65rem] font-bold tabular-nums ${all.length ? "text-bad" : ""}`}>{all.length}<span className="ml-1 text-sm font-normal text-muted">{all.length === 1 ? "artículo" : "artículos"}</span></p>
      {all.length === 0 ? <p className="text-sm text-muted">No falta nada. 🎉</p> : (
        <ul className="mt-1 flex flex-col divide-y divide-border">
          {shown.map((l) => (
            <li key={`${l.biz.id}-${l.key}`}>
              <Link href={`/negocios/${l.biz.id}/stock`} className="flex min-h-11 items-center gap-2 text-sm">
                {!biz && <span className="size-2 shrink-0 rounded-full" style={{ background: l.biz.color }} aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{l.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-bad">{l.missing > 0 ? `faltan ${l.missing}` : "a 0"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

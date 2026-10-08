import Link from "next/link";
import { MonthlyChartLazy } from "@/components/businesses/monthly-chart-lazy";
import { getContext } from "@/lib/context";
import { getMonthlySeries, getTopProducts } from "@/lib/data";
import { addMonths, endOfMonth, formatDate, startOfMonth } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { getPrintBagData, getRulesData, listInvoices } from "@/lib/production/data";
import { normalizeText } from "@/lib/production/text";
import { ORDER_STATUSES, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL } from "@/lib/schemas";
import { loadInventory } from "@/lib/stock/service";
import { WidgetCard } from "../widget-card";
import { businessOf, type WidgetProps } from "../types";

const pick = (msg: string, title: string) => <WidgetCard title={title}><p className="text-sm text-muted">{msg}</p></WidgetCard>;
const choose = (title: string) => pick("Pulsa «Editar» → ajustes de este widget y elige el negocio.", title);

/** «Ventas por mes»: ingresos, gastos y beneficio mes a mes (la misma serie que Estadísticas). */
export async function SalesMonthlyWidget({ w, ctx }: WidgetProps) {
  const biz = businessOf(w, ctx);
  const months = Number(w.settings.months) || 6;
  const data = await getMonthlySeries({ from: startOfMonth(addMonths(ctx.today, -(months - 1))), to: endOfMonth(ctx.today) }, biz?.id);
  return (
    <WidgetCard title={`Ventas por mes${biz ? ` · ${biz.name}` : ""}`} href={biz ? `/negocios/${biz.id}/estadisticas` : "/negocios"}>
      <MonthlyChartLazy data={data} />
    </WidgetCard>
  );
}

/** «Pedidos por estado»: contador de cada estado; cada uno lleva a la lista ya filtrada. */
export async function OrdersStatusWidget({ w, ctx }: WidgetProps) {
  const biz = businessOf(w, ctx);
  const { supabase, workspaceId } = await getContext();
  const live = ORDER_STATUSES.filter((s) => s !== "cancelado");
  const counts = await Promise.all(live.map(async (s) => {
    let q = supabase.from("orders").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", s);
    if (biz) q = q.eq("business_id", biz.id);
    return [s, (await q).count ?? 0] as const;
  }));
  return (
    <WidgetCard title={`Pedidos por estado${biz ? ` · ${biz.name}` : ""}`} href={biz ? `/negocios/${biz.id}/pedidos` : undefined}>
      <ul className="grid grid-cols-2 gap-2">
        {counts.map(([s, n]) => {
          const body = (
            <>
              <span className="flex items-center gap-1.5 text-xs text-muted"><span className="size-2 rounded-full" style={{ background: ORDER_STATUS_COLOR[s] }} aria-hidden />{ORDER_STATUS_LABEL[s]}</span>
              <span className="text-xl font-bold tabular-nums">{n}</span>
            </>
          );
          return (
            <li key={s}>
              {biz ? <Link href={`/negocios/${biz.id}/pedidos?estado=${s}`} className="flex min-h-14 flex-col justify-center rounded-lg bg-fill px-3 py-1.5">{body}</Link>
                : <div className="flex min-h-14 flex-col justify-center rounded-lg bg-fill px-3 py-1.5">{body}</div>}
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}

/** «Productos más vendidos» en el periodo de arriba (unidades e importe). */
export async function TopProductsWidget({ w, ctx }: WidgetProps) {
  const biz = businessOf(w, ctx);
  const rows = (await getTopProducts(ctx.range.current, "product", biz?.id)).slice(0, w.size === "l" ? 8 : 5);
  const max = Math.max(1, ...rows.map((r) => r.units));
  return (
    <WidgetCard title={`Más vendidos${biz ? ` · ${biz.name}` : ""}`} href={biz ? `/negocios/${biz.id}/estadisticas` : undefined}>
      {rows.length === 0 ? <p className="text-sm text-muted">Sin ventas en el periodo.</p> : (
        <ol className="flex flex-col gap-2.5">
          {rows.map((r, i) => (
            <li key={r.label} className="text-sm">
              <div className="mb-1 flex justify-between gap-2"><span className="truncate"><span className="mr-1.5 text-muted">{i + 1}.</span>{r.label}</span><span className="shrink-0 tabular-nums text-muted">{r.units} ud · {formatEUR(r.revenue)}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-[var(--chart-income)]" style={{ width: `${Math.max(2, (r.units / max) * 100)}%` }} /></div>
            </li>
          ))}
        </ol>
      )}
    </WidgetCard>
  );
}

/** «Resumen de stock»: unidades disponibles por grupo y valor a coste (de los artículos con coste conocido). */
export async function StockSummaryWidget({ w, ctx }: WidgetProps) {
  const biz = businessOf(w, ctx);
  if (!biz) return choose("Resumen de stock");
  const { supabase, workspaceId } = await getContext();
  const [inv, { data: products }] = await Promise.all([
    loadInventory(biz.id),
    supabase.from("products").select("id, name, cost_cents").eq("workspace_id", workspaceId).eq("business_id", biz.id),
  ]);
  // Valor a coste: artículos de Stock vinculados a un producto (o con su mismo nombre) que tiene coste.
  const costOf = (itemId: string) => {
    const it = inv.items.find((i) => i.id === itemId);
    const p = it && (products ?? []).find((x) => (it.product_id ? x.id === it.product_id : normalizeText(x.name) === normalizeText(it.name)));
    return p && p.cost_cents > 0 ? p.cost_cents : null;
  };
  let value = 0, priced = 0;
  for (const l of inv.lines) {
    if (!l.key.startsWith("item|")) continue;
    const c = costOf(l.key.slice(5));
    if (c != null && l.base > 0) { value += c * l.base; priced++; }
  }
  const groups = [["prendas", "Prendas"], ["dtf", "DTF"], ["articulos", "Materiales y productos"]] as const;
  const missing = inv.lines.filter((l) => l.needed).length;
  return (
    <WidgetCard title={`Resumen de stock · ${biz.name}`} href={`/negocios/${biz.id}/stock`}>
      <p className="text-[1.65rem] font-bold tabular-nums">{inv.lines.reduce((s, l) => s + Math.max(0, l.base), 0)}<span className="ml-1 text-sm font-normal text-muted">unidades</span></p>
      <p className="text-xs text-muted">{priced ? `Valor a coste: ${formatEUR(value)}` : "Sin coste: vincula los artículos a un producto con coste para ver su valor."}{missing ? ` · ${missing} por pedir` : ""}</p>
      <ul className="mt-2 flex flex-col divide-y divide-border text-sm">
        {groups.map(([g, label]) => {
          const ls = inv.lines.filter((l) => l.group === g);
          return ls.length ? <li key={g} className="flex min-h-10 items-center justify-between"><span>{label}</span><span className="tabular-nums">{ls.reduce((s, l) => s + l.available, 0)} disp.</span></li> : null;
        })}
      </ul>
    </WidgetCard>
  );
}

/** «Bolsa imprenta»: lo que hay que llevar a imprimir por los pedidos «Sin hacer». */
export async function PrintBagWidget({ w, ctx }: WidgetProps) {
  const biz = businessOf(w, ctx);
  if (!biz) return choose("Bolsa imprenta");
  const bag = biz.production === false ? null : await getPrintBagData(biz.id).catch(() => null);
  if (!bag) return pick("Este negocio no tiene el módulo de producción.", `Bolsa imprenta · ${biz.name}`);
  const lines = [...bag.shirts, ...bag.dtfs];
  const left = lines.filter((l) => !l.checked);
  return (
    <WidgetCard title={`Bolsa imprenta · ${biz.name}`} href={`/negocios/${biz.id}/bolsa`}>
      <p className="text-[1.65rem] font-bold tabular-nums">{left.reduce((s, l) => s + l.quantity, 0)}<span className="ml-1 text-sm font-normal text-muted">por meter · {bag.pendingOrders} pedidos</span></p>
      {left.length === 0 ? <p className="text-sm text-muted">Bolsa completa o sin pedidos «Sin hacer».</p> : (
        <ul className="mt-1 flex flex-col divide-y divide-border text-sm">
          {left.slice(0, w.size === "l" ? 8 : 4).map((l) => <li key={l.key} className="flex min-h-10 items-center justify-between gap-2"><span className="truncate">{l.label}</span><span className="tabular-nums">{l.quantity}</span></li>)}
        </ul>
      )}
    </WidgetCard>
  );
}

/** «Últimas facturas» (enlaces guardados en Facturas). */
export async function InvoicesLatestWidget({ w, ctx }: WidgetProps) {
  const biz = businessOf(w, ctx);
  if (!biz) return choose("Últimas facturas");
  const invoices = (await listInvoices(biz.id)).slice(0, w.size === "l" ? 8 : 4);
  return (
    <WidgetCard title={`Últimas facturas · ${biz.name}`} href={`/negocios/${biz.id}/facturas`}>
      {invoices.length === 0 ? <p className="text-sm text-muted">Aún no hay facturas.</p> : (
        <ul className="flex flex-col divide-y divide-border text-sm">
          {invoices.map((i) => (
            <li key={i.id}><a href={i.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-between gap-2"><span className="truncate">{i.name}</span><span className="shrink-0 text-xs text-muted">{formatDate(i.created_at.slice(0, 10))}</span></a></li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

/** «Reglas Antola»: reglas de color de DTF y si Antola está conectado. */
export async function AntolaRulesWidget({ ctx, w }: WidgetProps) {
  const biz = businessOf(w, ctx);
  if (!biz) return choose("Reglas Antola");
  const data = biz.production === false ? null : await getRulesData(biz.id).catch(() => null);
  if (!data) return pick("Este negocio no tiene el módulo de producción.", `Reglas Antola · ${biz.name}`);
  return (
    <WidgetCard title={`Reglas Antola · ${biz.name}`} href={`/negocios/${biz.id}/reglas`}>
      <ul className="flex flex-col divide-y divide-border text-sm">
        <li className="flex min-h-10 items-center justify-between"><span>Reglas por color de prenda</span><span className="tabular-nums">{data.shirtRules.length}</span></li>
        <li className="flex min-h-10 items-center justify-between"><span>DTF especiales por diseño</span><span className="tabular-nums">{data.designRules.length}</span></li>
        <li className="flex min-h-10 items-center justify-between"><span>Diseños</span><span className="tabular-nums">{data.catalog.designs.length}</span></li>
        <li className="flex min-h-10 items-center justify-between"><span>Antola</span><span className={data.antolaCreatedAt ? "text-good" : "text-muted"}>{data.antolaCreatedAt ? "Conectado" : "Sin conectar"}</span></li>
      </ul>
    </WidgetCard>
  );
}

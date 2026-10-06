import Link from "next/link";
import { getContext } from "@/lib/context";
import { getExpensesByCategory, getTotalsByBusiness } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/schemas";
import { Delta, WidgetCard } from "../widget-card";
import { businessOf, type WidgetProps } from "../types";

const PENDING: OrderStatus[] = ["sin_hacer", "en_casa", "en_paquete"];

/** Barra horizontal fina con la parte proporcional al máximo. */
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`, background: color }} /></div>;
}

/** Gastos por categoría en el periodo de arriba (misma función que Estadísticas). */
export async function ExpensesCategoryWidget({ w, ctx }: WidgetProps) {
  const biz = businessOf(w, ctx);
  const rows = await getExpensesByCategory(ctx.range.current, biz?.id);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const max = Math.max(0, ...rows.map((r) => r.amount));
  const shown = rows.slice(0, w.size === "l" ? 8 : 5);
  return (
    <WidgetCard title={`Gastos por categoría${biz ? ` · ${biz.name}` : ""}`} href={biz ? `/negocios/${biz.id}/gastos` : "/negocios"}>
      <p className="text-[1.65rem] font-bold tabular-nums">{formatEUR(total)}</p>
      {shown.length === 0 ? <p className="text-sm text-muted">Sin gastos en el periodo.</p> : (
        <ul className="mt-2 flex flex-col gap-2.5">
          {shown.map((r) => (
            <li key={r.label} className="text-sm">
              <div className="mb-1 flex justify-between gap-2"><span className="truncate">{r.label}</span><span className="shrink-0 tabular-nums text-muted">{formatEUR(r.amount)} · {total ? Math.round((r.amount / total) * 100) : 0} %</span></div>
              <Bar value={r.amount} max={max} color={r.color ?? "var(--chart-expense)"} />
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

/** Pedidos pendientes de enviar (o los últimos) de todos los negocios o de uno. */
export async function OrdersWidget({ w, ctx }: WidgetProps) {
  const biz = businessOf(w, ctx);
  const { supabase, workspaceId } = await getContext();
  const pending = w.settings.show !== "latest";
  let q = supabase.from("orders").select("id, business_id, order_number, order_date, customer, status, total_cents", { count: "exact" })
    .eq("workspace_id", workspaceId).order("order_date", { ascending: pending }).order("created_at", { ascending: pending }).limit(w.size === "l" ? 10 : 5);
  q = pending ? q.in("status", PENDING) : q.neq("status", "cancelado");
  if (biz) q = q.eq("business_id", biz.id);
  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  const color = new Map(ctx.businesses.map((b) => [b.id, b.color]));
  return (
    <WidgetCard title={`${pending ? "Pedidos pendientes" : "Últimos pedidos"}${biz ? ` · ${biz.name}` : ""}`} href={biz ? `/negocios/${biz.id}/pedidos` : "/negocios"}>
      {pending && <p className="text-[1.65rem] font-bold tabular-nums">{count ?? 0}<span className="ml-1 text-sm font-normal text-muted">sin enviar</span></p>}
      {(data ?? []).length === 0 ? <p className="text-sm text-muted">{pending ? "Todo enviado. 🎉" : "Aún no hay pedidos."}</p> : (
        <ul className="mt-1 flex flex-col divide-y divide-border">
          {data!.map((o) => (
            <li key={o.id}>
              <Link href={`/negocios/${o.business_id}/pedidos?abrir=${o.id}`} className="flex min-h-11 items-center gap-2 text-sm">
                <span className="size-2 shrink-0 rounded-full" style={{ background: color.get(o.business_id) ?? "var(--muted)" }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{o.order_number ? `#${o.order_number} · ` : ""}{o.customer ?? formatDate(o.order_date)}</span>
                <span className="shrink-0 text-xs text-muted">{ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}</span>
                <span className="w-20 shrink-0 text-right tabular-nums">{formatEUR(o.total_cents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

/** Ventas y beneficio de cada negocio en el periodo, con su color y la variación frente al anterior. */
export async function BusinessCompareWidget({ ctx }: WidgetProps) {
  const [cur, prev] = await Promise.all([getTotalsByBusiness(ctx.range.current), getTotalsByBusiness(ctx.range.previous)]);
  const rows = ctx.businesses.map((b) => ({ b, c: cur.get(b.id) ?? { income: 0, profit: 0 }, p: prev.get(b.id) ?? { income: 0, profit: 0 } }));
  const max = Math.max(0, ...rows.map((r) => r.c.income));
  return (
    <WidgetCard title="Comparativa entre negocios" href="/negocios">
      {rows.length === 0 ? <p className="text-sm text-muted">Aún no tienes negocios.</p> : (
        <ul className="flex flex-col gap-3">
          {rows.sort((a, b) => b.c.income - a.c.income).map(({ b, c, p }) => (
            <li key={b.id}>
              <Link href={`/negocios/${b.id}`} className="block text-sm">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium"><span className="size-2 shrink-0 rounded-full" style={{ background: b.color }} aria-hidden /><span className="truncate">{b.name}</span></span>
                  <span className="flex shrink-0 items-baseline gap-1.5"><span className="font-semibold tabular-nums">{formatEUR(c.income)}</span>{ctx.compare && <Delta current={c.income} previous={p.income} />}</span>
                </div>
                <Bar value={c.income} max={max} color={b.color} />
                <p className="mt-1 text-xs tabular-nums text-muted">Beneficio {formatEUR(c.profit)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

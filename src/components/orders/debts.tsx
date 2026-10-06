"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BellRing } from "lucide-react";
import { createDebtTask, reviewOldOrders } from "@/app/(app)/negocios/payments-actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { AGING_LABEL, type AgingBucket, type Debtor } from "@/lib/orders/payments";

const CollectionsChart = dynamic(() => import("./collections-chart"), { ssr: false, loading: () => <div className="skeleton h-60 w-full" aria-hidden /> });

const days = (n: number) => (n === 0 ? "hoy" : n === 1 ? "hace 1 día" : `hace ${n} días`);

/** Bloque «Me deben»: total pendiente, nº de pedidos y antigüedad de la deuda más vieja. */
export function OwedSummary({ totalCents, count, oldestDays, href, active }: { totalCents: number; count: number; oldestDays: number; href: string; active: boolean }) {
  return (
    <Link href={href} scroll={false} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 hover:bg-surface-2" aria-current={active ? "page" : undefined}>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">Me deben</p>
        <p className={`text-2xl font-semibold tabular-nums ${totalCents > 0 ? "text-bad" : ""}`}>{formatEUR(totalCents)}</p>
        <p className="text-xs text-muted">{count === 0 ? "Nada pendiente de cobro" : `${count} ${count === 1 ? "pedido" : "pedidos"} · la más antigua de ${days(oldestDays)}`}</p>
      </div>
      <span className="shrink-0 text-sm font-medium text-accent">{active ? "Ver pedidos" : "Quién me debe →"}</span>
    </Link>
  );
}

/** Aviso de pedidos anteriores a los cobros, con la acción en bloque. */
export function UnreviewedBanner({ businessId, count }: { businessId: string; count: number }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const run = (mode: "paid" | "pending") => {
    const msg = mode === "paid"
      ? `Se registrará un cobro con la fecha de cada pedido por lo que falte en ${count} pedidos. ¿Seguro?`
      : `Los ${count} pedidos pasarán a contar como pendientes de cobro. ¿Seguro?`;
    if (!confirm(msg)) return;
    start(async () => {
      const r = await reviewOldOrders(businessId, mode);
      toast({ message: r.ok ? `${r.count ?? 0} pedidos revisados` : r.error });
      router.refresh();
    });
  };
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p><strong>{count} {count === 1 ? "pedido" : "pedidos"} sin revisar</strong> <span className="text-muted">· no cuentan como deuda</span></p>
        <button type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open} className="min-h-11 shrink-0 px-2 text-sm font-semibold text-accent">{open ? "Cerrar" : "Revisar"}</button>
      </div>
      {open && (
        <>
          <p className="text-muted">Son pedidos de antes de apuntar cobros. Revísalos uno a uno o márcalos todos de golpe:</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => run("paid")}>Todos están cobrados</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => run("pending")}>Todos están sin cobrar</Button>
            <Link href="?pago=unreviewed" className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-accent">Ver cuáles son</Link>
          </div>
        </>
      )}
    </div>
  );
}

/** Vista «Quién me debe»: por cliente, de mayor a menor, con gráficos y «Crear tarea para reclamar». */
export function DebtsView({ businessId, debtors, aging, collections }: {
  businessId: string; debtors: Debtor[]; aging: Record<AgingBucket, number>; collections: { month: string; collected: number; pending: number }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [done, setDone] = useState<Record<string, string>>({});
  const maxAging = Math.max(...Object.values(aging), 1);
  const reclaim = (d: Debtor) => start(async () => {
    const r = await createDebtTask({ businessId, customer: d.customer, dueCents: d.dueCents, orders: d.orders.length });
    if (r.ok) { setDone((x) => ({ ...x, [d.key]: r.href ?? "/tareas" })); toast({ message: "Tarea creada para hoy" }); router.refresh(); }
    else toast({ message: r.error });
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold">Cobrado y pendiente por mes</h2>
          <CollectionsChart data={collections} />
        </section>
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold">Antigüedad de la deuda</h2>
          <ul className="flex flex-col gap-3" role="list">
            {(Object.keys(AGING_LABEL) as AgingBucket[]).map((b) => (
              <li key={b} className="flex flex-col gap-1">
                <span className="flex justify-between text-xs"><span className="text-muted">{AGING_LABEL[b]}</span><span className="font-semibold tabular-nums">{formatEUR(aging[b])}</span></span>
                <span className="h-3 w-full overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-expense" style={{ width: `${(aging[b] / maxAging) * 100}%`, opacity: b === "0-7" ? 0.55 : b === "8-30" ? 0.78 : 1 }} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section>
        <h2 className="mb-2 text-sm font-semibold">Quién me debe</h2>
        {debtors.length === 0 ? <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">Nadie te debe nada. 🎉</p> : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {debtors.map((d) => (
              <li key={d.key} className="flex flex-col gap-2 p-4 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-3"><span className="truncate font-medium">{d.customer}</span><span className="shrink-0 font-semibold tabular-nums text-bad">{formatEUR(d.dueCents)}</span></p>
                  <p className="text-xs text-muted">{d.orders.length} {d.orders.length === 1 ? "pedido" : "pedidos"} · el más antiguo {days(d.oldestDays)}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {d.orders.slice(0, 6).map((o) => <Link key={o.id} href={`?abrir=${o.id}`} className="text-accent">{o.order_number ? `nº ${o.order_number}` : formatDate(o.order_date)} · {formatEUR(o.due_cents)}</Link>)}
                    {d.orders.length > 6 && <span className="text-muted">y {d.orders.length - 6} más</span>}
                  </p>
                </div>
                {done[d.key]
                  ? <Link href={done[d.key]} className="inline-flex min-h-11 items-center text-sm font-medium text-good">Tarea creada · ver</Link>
                  : <Button type="button" variant="secondary" disabled={busy} onClick={() => reclaim(d)} className="shrink-0"><BellRing className="size-4" aria-hidden /> Crear tarea para reclamar</Button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

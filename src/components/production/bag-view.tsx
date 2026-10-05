"use client";

import { ClipboardCopy, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { resetPrintBag, togglePrintBagLine } from "@/app/(app)/negocios/actions-production";
import { Button } from "@/components/ui/button";
import type { CheckedBagLine } from "@/lib/production/data";
import { printBagToText } from "@/lib/production/print-bag";
import { cn } from "@/lib/utils";

type Bag = { pendingOrders: number; shirts: CheckedBagLine[]; dtfs: CheckedBagLine[]; warnings: { orderId: string; orderRef: string; problems: string[] }[]; colorsWithoutRule: string[] };

function Section({ title, items, onToggle }: { title: string; items: CheckedBagLine[]; onToggle: (l: CheckedBagLine) => void }) {
  if (items.length === 0) return null;
  return (
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">{title} ({items.reduce((s, l) => s + l.quantity, 0)})</h2>
        <ul className="divide-y divide-border">
          {items.map((l) => (
            <li key={l.key}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 py-1.5">
                <input type="checkbox" checked={l.checked} onChange={() => onToggle(l)} className="size-5 shrink-0" />
                <span className={cn("flex-1 text-sm", l.checked && "text-muted line-through")}>
                  <span className="font-semibold tabular-nums">{l.quantity} ×</span> {l.label}
                  {l.changed && <span className="ml-2 rounded bg-amber-500/15 px-1.5 text-xs text-amber-700 dark:text-amber-400">ha cambiado</span>}
                  {l.missingRuleFor && <span className="block text-xs text-danger">Falta la regla de color de DTF para {l.missingRuleFor}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>
    );
}

export function BagView({ businessId, bag }: { businessId: string; bag: Bag }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [lines, toggleOptimistic] = useOptimistic({ shirts: bag.shirts, dtfs: bag.dtfs }, (s, k: string) => {
    const flip = (l: CheckedBagLine) => (l.key === k ? { ...l, checked: !l.checked, changed: false } : l);
    return { shirts: s.shirts.map(flip), dtfs: s.dtfs.map(flip) };
  });

  const toggle = (l: CheckedBagLine) =>
    start(async () => {
      toggleOptimistic(l.key);
      await togglePrintBagLine({ businessId, key: l.key, quantity: l.quantity, checked: !l.checked });
      router.refresh();
    });

  async function copy() {
    await navigator.clipboard.writeText(printBagToText(bag));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (bag.pendingOrders === 0) return <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">No hay pedidos «Sin hacer». La bolsa se rellena sola con ellos.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted">{bag.pendingOrders} líneas de pedidos sin hacer</p>
        <span className="flex-1" />
        <Button variant="secondary" onClick={copy}><ClipboardCopy className="size-4" aria-hidden /> {copied ? "¡Copiado!" : "Copiar lista"}</Button>
        <Button variant="ghost" onClick={() => start(async () => { await resetPrintBag(businessId); router.refresh(); })}><RotateCcw className="size-4" aria-hidden /> Desmarcar todo</Button>
      </div>
      {bag.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <p className="mb-1 font-medium">Pedidos incompletos</p>
          <ul className="list-disc pl-5 text-xs text-muted">{bag.warnings.map((w) => <li key={w.orderId + w.problems.join()}>{w.orderRef}: {w.problems.join(", ")}</li>)}</ul>
        </div>
      )}
      <Section title="Camisetas y sudaderas" items={lines.shirts} onToggle={toggle} />
      <Section title="DTF" items={lines.dtfs} onToggle={toggle} />
    </div>
  );
}

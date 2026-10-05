"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteIncome, deleteProduct, saveIncome, saveProduct } from "@/app/(app)/negocios/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { Income, Product } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { formatDecimal, formatEUR } from "@/lib/money";

function useSave(close: () => void) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { setError(null); close(); } else setError(r.error ?? "Error");
    });
  return { pending, error, run };
}

/* ------------------------------------------------------------------ ingresos */
export function IncomesView({ businessId, incomes, today }: { businessId: string; incomes: Income[]; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Income | "new" | null>(null);
  const close = () => { setEditing(null); router.refresh(); };
  const { pending, error, run } = useSave(close);
  const cur = editing && editing !== "new" ? editing : null;

  return (
    <>
      <p className="mb-3 text-sm text-muted">Ingresos que no vienen de un pedido (por ejemplo, ventas en Vinted o encargos sueltos). Los pedidos suman solos.</p>
      <div className="mb-3"><Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Nuevo ingreso</Button></div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {incomes.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => setEditing(i)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-surface-2">
              <span className="flex min-w-0 flex-col"><span className="truncate text-sm font-medium">{i.concept ?? i.source}</span><span className="text-xs text-muted">{formatDate(i.income_date)} · {i.source}</span></span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">+{formatEUR(i.amount_cents)}</span>
            </button>
          </li>
        ))}
        {incomes.length === 0 && <li className="p-6 text-center text-sm text-muted">Aún no hay ingresos sueltos.</li>}
      </ul>
      <Sheet open={editing !== null} onClose={close} title={cur ? "Editar ingreso" : "Nuevo ingreso"}>
        {editing !== null && (
          <form key={cur?.id ?? "new"} className="flex flex-col gap-4" action={(fd) =>
            run(() => saveIncome({ id: cur?.id, business_id: businessId, income_date: String(fd.get("d")), source: String(fd.get("s")), concept: String(fd.get("c") ?? ""), amount: String(fd.get("a")), method: String(fd.get("m") ?? "") }))}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Importe (€)" htmlFor="i-a"><Input id="i-a" name="a" inputMode="decimal" defaultValue={cur ? formatDecimal(cur.amount_cents) : ""} placeholder="0,00" required autoFocus /></Field>
              <Field label="Fecha" htmlFor="i-d"><Input id="i-d" name="d" type="date" defaultValue={cur?.income_date ?? today} required /></Field>
              <Field label="Fuente" htmlFor="i-s"><Input id="i-s" name="s" defaultValue={cur?.source ?? ""} placeholder="Vinted, Bizum…" maxLength={60} required /></Field>
              <Field label="Método" htmlFor="i-m"><Input id="i-m" name="m" defaultValue={cur?.method ?? ""} maxLength={40} /></Field>
              <Field label="Concepto" htmlFor="i-c" className="col-span-2"><Input id="i-c" name="c" defaultValue={cur?.concept ?? ""} maxLength={120} /></Field>
            </div>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending} className="flex-1">Guardar</Button>
              {cur && <Button type="button" variant="secondary" disabled={pending} onClick={() => {
                const snap = { id: cur.id, business_id: cur.business_id, income_date: cur.income_date, source: cur.source, concept: cur.concept ?? undefined, amount: formatDecimal(cur.amount_cents), method: cur.method ?? undefined };
                run(() => deleteIncome(cur.id));
                toast({ message: "Ingreso eliminado", actionLabel: "Deshacer", onAction: () => void saveIncome(snap).then(() => router.refresh()) });
              }}><Trash2 className="size-4" aria-hidden /> Eliminar</Button>}
            </div>
          </form>
        )}
      </Sheet>
    </>
  );
}

/* ----------------------------------------------------------------- productos */
export function ProductsView({ businessId, products }: { businessId: string; products: Product[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const close = () => { setEditing(null); router.refresh(); };
  const { pending, error, run } = useSave(close);
  const cur = editing && editing !== "new" ? editing : null;

  return (
    <>
      <p className="mb-3 text-sm text-muted">Tu catálogo con precio y coste. Al crear un pedido, al escribir el nombre se rellenan solos.</p>
      <div className="mb-3"><Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Nuevo producto</Button></div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {products.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setEditing(p)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-surface-2">
              <span className="truncate text-sm font-medium">{p.name}</span>
              <span className="shrink-0 text-xs text-muted tabular-nums">coste {formatEUR(p.cost_cents)} · <span className="text-sm font-semibold text-foreground">{formatEUR(p.price_cents)}</span></span>
            </button>
          </li>
        ))}
        {products.length === 0 && <li className="p-6 text-center text-sm text-muted">Sin productos todavía. Se crean al importar PROFITY o a mano.</li>}
      </ul>
      <Sheet open={editing !== null} onClose={close} title={cur ? "Editar producto" : "Nuevo producto"}>
        {editing !== null && (
          <form key={cur?.id ?? "new"} className="flex flex-col gap-4" action={(fd) =>
            run(() => saveProduct({ id: cur?.id, business_id: businessId, name: String(fd.get("n")), price: String(fd.get("p") ?? ""), cost: String(fd.get("c") ?? "") }))}>
            <Field label="Nombre" htmlFor="p-n"><Input id="p-n" name="n" defaultValue={cur?.name ?? ""} maxLength={80} required autoFocus /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio (€)" htmlFor="p-p"><Input id="p-p" name="p" inputMode="decimal" defaultValue={cur ? formatDecimal(cur.price_cents) : ""} placeholder="0,00" /></Field>
              <Field label="Coste (€)" htmlFor="p-c"><Input id="p-c" name="c" inputMode="decimal" defaultValue={cur ? formatDecimal(cur.cost_cents) : ""} placeholder="0,00" /></Field>
            </div>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending} className="flex-1">Guardar</Button>
              {cur && <Button type="button" variant="secondary" disabled={pending} onClick={() => {
                const snap = { business_id: cur.business_id, name: cur.name, price: formatDecimal(cur.price_cents), cost: formatDecimal(cur.cost_cents) };
                run(() => deleteProduct(cur.id));
                toast({ message: "Producto eliminado", actionLabel: "Deshacer", onAction: () => void saveProduct(snap).then(() => router.refresh()) });
              }}><Trash2 className="size-4" aria-hidden /> Eliminar</Button>}
            </div>
          </form>
        )}
      </Sheet>
    </>
  );
}

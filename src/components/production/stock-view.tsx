"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addDesign, addModel, adjustDtfStock, adjustTshirtStock, removeDesign, removeModel } from "@/app/(app)/negocios/actions-production";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { DtfVariant } from "@/lib/production/catalog";
import type { computeStockOverview } from "@/lib/production/stock";
import { garmentLabel } from "@/lib/production/stock";
import { DEFAULT_SIZES } from "@/lib/production/text";
import { cn } from "@/lib/utils";

type Overview = ReturnType<typeof computeStockOverview> & { catalog: { designs: { name: string; kind: "standalone" | "paired" }[] } };
type Target =
  | { kind: "tshirt"; model: string; size: string; current: number; base: number }
  | { kind: "dtf"; name: string; variant: DtfVariant; current: number; base: number };

const VARIANT_LABEL: Record<DtfVariant, string> = { UNICO: "Único", BLANCO: "Blanco", NEGRO: "Negro" };
const tone = (q: number) => (q < 0 ? "text-danger font-semibold" : q === 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : "");

export function StockView({ businessId, overview, models }: { businessId: string; overview: Overview; models: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<Target | null>(null);
  const [amount, setAmount] = useState("1");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Error");
      setError(null);
      onOk?.();
      router.refresh();
    });

  function adjust(sign: 1 | -1) {
    if (!target) return;
    const delta = sign * Math.max(1, parseInt(amount, 10) || 1);
    const t = target;
    const undo = () => run(() => (t.kind === "tshirt" ? adjustTshirtStock({ businessId, model: t.model, size: t.size, delta: -delta }) : adjustDtfStock({ businessId, name: t.name, variant: t.variant, delta: -delta })));
    run(() => (t.kind === "tshirt" ? adjustTshirtStock({ businessId, model: t.model, size: t.size, delta }) : adjustDtfStock({ businessId, name: t.name, variant: t.variant, delta })), () => {
      setTarget(null);
      toast({ message: `Stock ${delta > 0 ? "+" : ""}${delta}`, actionLabel: "Deshacer", onAction: undo });
    });
  }

  const models_ = [...new Set(overview.tshirts.map((t) => t.model))];
  const designs = [...new Set(overview.dtfs.map((d) => d.name))];

  return (
    <div className="flex flex-col gap-5">
      {overview.needsOrder.length === 0 ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"><p className="font-semibold text-emerald-700 dark:text-emerald-400">Todo en orden</p><p className="text-xs text-muted">No falta ninguna prenda ni ningún DTF por ahora.</p></div>
      ) : (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
          <h2 className="font-semibold text-danger">Pedir ya</h2>
          <p className="mb-3 text-xs text-muted">{overview.needsOrder.length} {overview.needsOrder.length === 1 ? "artículo" : "artículos"} a 0 o en negativo (stock − pedidos sin hacer o sin llegar)</p>
          <ul className="flex flex-wrap gap-2">
            {overview.needsOrder.map((n) => (
              <li key={n.key} className="flex items-center gap-2 rounded-full border border-danger/40 bg-surface px-3 py-1.5 text-xs font-medium text-danger">
                {n.label}<span className="rounded-full bg-danger/15 px-1.5 py-0.5 text-[11px] font-semibold">{n.quantity}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Prendas · {overview.tshirtTotal} en total</h2><Button variant="secondary" onClick={() => setCatalogOpen(true)}>Catálogo</Button></div>
        {models_.length === 0 ? <p className="text-sm text-muted">Aún no hay modelos. Pulsa «Catálogo» para añadir «Blanca», «Negra»…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="py-1 pr-2 font-medium">Modelo</th>{DEFAULT_SIZES.map((s) => <th key={s} className="px-1 py-1 text-center font-medium">{s}</th>)}</tr></thead>
              <tbody>
                {models_.map((m) => (
                  <tr key={m} className="border-t border-border">
                    <td className="whitespace-nowrap py-1 pr-1 text-xs font-medium sm:text-sm">{garmentLabel(m)}</td>
                    {DEFAULT_SIZES.map((size) => {
                      const row = overview.tshirts.find((t) => t.model === m && t.size === size);
                      return (
                        <td key={size} className="px-0.5 py-0.5 text-center">
                          {row ? <button type="button" onClick={() => { setAmount("1"); setTarget({ kind: "tshirt", model: m, size, current: row.quantity, base: row.base }); }} className={cn("min-h-11 w-full min-w-8 rounded-lg tabular-nums hover:bg-surface-2 md:min-h-9", tone(row.quantity))}>{row.quantity}</button> : <span className="text-muted">–</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">DTF · {overview.dtfTotal} en total</h2>
        {designs.length === 0 ? <p className="text-sm text-muted">Sin diseños. Añádelos en «Catálogo».</p> : (
          <ul className="divide-y divide-border">
            {designs.map((name) => (
              <li key={name} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="text-sm font-medium">{name}</span>
                <span className="flex gap-1.5">
                  {overview.dtfs.filter((d) => d.name === name).map((d) => (
                    <button key={d.variant} type="button" onClick={() => { setAmount("1"); setTarget({ kind: "dtf", name, variant: d.variant, current: d.quantity, base: d.base }); }}
                      className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs hover:bg-surface-2 md:min-h-9">
                      <span className="text-muted">{VARIANT_LABEL[d.variant]}</span><span className={cn("tabular-nums text-sm", tone(d.quantity))}>{d.quantity}</span>
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Sheet open={target !== null} onClose={() => setTarget(null)} title="Ajustar stock">
        {target && (
          <div className="flex flex-col gap-4">
            <p className="text-sm"><strong>{target.kind === "tshirt" ? `${garmentLabel(target.model)} · talla ${target.size}` : `${target.name} · ${VARIANT_LABEL[target.variant]}`}</strong><br /><span className="text-muted">Tienes {target.base} · tras pedidos pendientes: {target.current}</span></p>
            <Field label="Cantidad" htmlFor="adj"><Input id="adj" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => adjust(1)} disabled={pending}><Plus className="size-4" aria-hidden /> Sumar</Button>
              <Button variant="secondary" onClick={() => adjust(-1)} disabled={pending}><Minus className="size-4" aria-hidden /> Restar</Button>
            </div>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          </div>
        )}
      </Sheet>

      <Sheet open={catalogOpen} onClose={() => setCatalogOpen(false)} title="Catálogo de producción">
        <div className="flex flex-col gap-5">
          <section><h3 className="mb-2 text-sm font-semibold">Modelos de prenda</h3>
            <ul className="mb-2 flex flex-wrap gap-2">{models.map((m) => (
              <li key={m} className="flex items-center gap-1 rounded-full border border-border py-0.5 pl-3 pr-1 text-sm">{m}
                <button type="button" aria-label={`Quitar ${m}`} className="flex size-9 items-center justify-center text-muted hover:text-danger" onClick={() => run(() => removeModel(businessId, m))}><Trash2 className="size-4" aria-hidden /></button></li>))}</ul>
            <form className="flex gap-2" action={(fd) => { const n = String(fd.get("m") ?? "").trim(); if (n) run(() => addModel(businessId, n)); }}>
              <Input name="m" placeholder="Blanca, Negra, Sudadera negra…" maxLength={40} aria-label="Nuevo modelo" /><Button type="submit">Añadir</Button>
            </form>
            <p className="mt-1 text-xs text-muted">Se crea con las tallas S, M, L, XL y XXL.</p>
          </section>
          <section><h3 className="mb-2 text-sm font-semibold">Diseños DTF</h3>
            <ul className="mb-2 flex flex-wrap gap-2">{overview.catalog.designs.map((d) => (
              <li key={d.name} className="flex items-center gap-1 rounded-full border border-border py-0.5 pl-3 pr-1 text-sm">{d.name}<span className="text-xs text-muted">({d.kind === "standalone" ? "único" : "blanco/negro"})</span>
                <button type="button" aria-label={`Quitar ${d.name}`} className="flex size-9 items-center justify-center text-muted hover:text-danger" onClick={() => run(() => removeDesign(businessId, d.name))}><Trash2 className="size-4" aria-hidden /></button></li>))}</ul>
            <form className="grid grid-cols-[1fr_auto] gap-2" action={(fd) => { const n = String(fd.get("d") ?? "").trim(); if (n) run(() => addDesign(businessId, n, fd.get("k") === "standalone" ? "standalone" : "paired")); }}>
              <Input name="d" placeholder="Nombre del diseño" maxLength={60} aria-label="Nuevo diseño" /><Button type="submit">Añadir</Button>
              <Select name="k" defaultValue="paired" aria-label="Tipo de diseño"><option value="paired">Blanco y negro (según prenda)</option><option value="standalone">Único (no depende de la prenda)</option></Select>
            </form>
          </section>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
      </Sheet>
    </div>
  );
}

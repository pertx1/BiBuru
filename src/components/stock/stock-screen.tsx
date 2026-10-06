"use client";

import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adjustStock, deleteStockItem, saveStockItem, setStockMin } from "@/app/(app)/negocios/stock-actions";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/dates";
import { GROUP_LABEL, shortages, type StockGroup, type StockLine } from "@/lib/stock/shortage";
import { cn } from "@/lib/utils";

type Item = { id: string; name: string; variant: string; product_id: string | null; match_color: string | null; match_size: string | null; quantity: number; min_quantity: number };
type Move = { id: string; label: string; kind: string; delta: number; reason: string | null; moved_on: string };

const tone = (l: StockLine) => (l.missing > 0 ? "text-bad font-semibold" : l.available <= l.min ? "text-amber-600 dark:text-amber-400 font-semibold" : "");

/** Pantalla de Stock: lo que falta arriba, inventario por grupos con ajuste rápido y últimos movimientos. */
export function StockScreen({ businessId, lines, items, production, products, moves, taskByKey }: {
  businessId: string; lines: StockLine[]; items: Item[]; production: boolean; products: { id: string; name: string }[]; moves: Move[]; taskByKey: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [target, setTarget] = useState<StockLine | null>(null);
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const missing = shortages(lines);
  const groups = (["prendas", "dtf", "articulos"] as StockGroup[]).map((g) => ({ g, rows: lines.filter((l) => l.group === g) })).filter((x) => x.rows.length || x.g === "articulos");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: () => void, msg?: string) => start(async () => {
    const r = await fn();
    if (!r.ok) return setError(r.error ?? "Error");
    setError(null); done(); if (msg) toast({ message: msg }); router.refresh();
  });

  return (
    <div className="flex flex-col gap-5">
      {missing.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-good/30 bg-good/5 p-4"><CheckCircle2 className="size-5 text-good" aria-hidden /><div><p className="font-semibold text-good">No falta nada</p><p className="text-xs text-muted">Los pedidos pendientes están cubiertos y todo está por encima del mínimo.</p></div></div>
      ) : (
        <section className="rounded-xl border border-bad/30 bg-bad/5 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-bad"><AlertTriangle className="size-4" aria-hidden /> Falta stock</h2>
          <p className="mb-2 text-xs text-muted">Cada artículo tiene su tarea «Reponer» en Tareas (se actualiza y se completa sola).</p>
          <ul className="divide-y divide-border">
            {missing.map((l) => (
              <li key={l.key} className="flex min-h-12 items-center gap-2 py-1.5 text-sm">
                <button type="button" onClick={() => setTarget(l)} className="min-w-0 flex-1 truncate text-left font-medium">{l.label}</button>
                <span className="shrink-0 text-xs text-muted">{l.reserved > 0 ? `${l.reserved} en pedidos` : `mín. ${l.min}`}</span>
                <span className="w-20 shrink-0 text-right font-semibold tabular-nums text-bad">faltan {l.missing}</span>
                {taskByKey[l.key] && <Link href={`/tareas?abrir=${taskByKey[l.key]}`} className="inline-flex min-h-11 shrink-0 items-center px-1 text-xs font-medium text-accent">Tarea</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.map(({ g, rows }) => (
        <section key={g} className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{GROUP_LABEL[g]}</h2>
            {g === "articulos"
              ? <Button variant="secondary" className="shrink-0 whitespace-nowrap" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Añadir artículo</Button>
              : <Link href={`/negocios/${businessId}/produccion`} className="text-xs text-accent">Catálogo en Producción</Link>}
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-muted">{production ? "Bolsas, etiquetas, productos terminados… lo que quieras controlar además de prendas y DTF." : "Añade lo que quieras controlar: camisetas por talla y color, materiales, productos terminados…"} Si su nombre coincide con el producto de los pedidos (o lo vinculas), los pedidos pendientes lo reservan solos.</p>
          ) : (
            <ul className="divide-y divide-border">
              <li className="hidden grid-cols-[1fr_5rem_5rem_5rem_5rem] gap-2 pb-1 text-xs text-muted md:grid"><span>Artículo</span><span className="text-right">Tienes</span><span className="text-right">Reservado</span><span className="text-right">Disponible</span><span className="text-right">Mínimo</span></li>
              {rows.map((l) => (
                <li key={l.key}>
                  <button type="button" onClick={() => setTarget(l)} className="grid min-h-12 w-full grid-cols-[1fr_auto] items-center gap-x-2 py-1.5 text-left text-sm hover:bg-surface-2 md:grid-cols-[1fr_5rem_5rem_5rem_5rem]">
                    <span className="truncate font-medium">{l.label}</span>
                    <span className={cn("text-right tabular-nums md:hidden", tone(l))}>{l.available}<span className="ml-1 text-xs font-normal text-muted">disp.</span></span>
                    <span className="col-span-2 text-xs text-muted md:hidden">Tienes {l.base} · {l.reserved} en pedidos{l.min ? ` · mín. ${l.min}` : ""}</span>
                    <span className="hidden text-right tabular-nums md:block">{l.base}</span>
                    <span className="hidden text-right tabular-nums text-muted md:block">{l.reserved}</span>
                    <span className={cn("hidden text-right tabular-nums md:block", tone(l))}>{l.available}</span>
                    <span className="hidden text-right tabular-nums text-muted md:block">{l.min || "–"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Últimos movimientos</h2>
        {moves.length === 0 ? <p className="text-sm text-muted">Aún no hay movimientos.</p> : (
          <ul className="divide-y divide-border text-sm">
            {moves.map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-1.5">
                <span className="w-20 shrink-0 text-xs tabular-nums text-muted">{formatDate(m.moved_on)}</span>
                <span className="min-w-0 flex-1 truncate">{m.label}{m.reason ? <span className="text-muted"> · {m.reason}</span> : null}</span>
                <span className={cn("shrink-0 font-semibold tabular-nums", m.delta > 0 ? "text-good" : "text-bad")}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Sheet open={!!target} onClose={() => { setTarget(null); setError(null); }} title="Ajustar stock">
        {target && <AdjustForm line={target} busy={busy} error={error}
          onAdjust={(mode, amount, reason) => run(() => adjustStock({ businessId, key: target.key, label: target.label, mode, amount, reason }), () => setTarget(null), "Stock guardado")}
          onMin={(min) => run(() => setStockMin({ businessId, key: target.key, min }), () => setTarget(null), "Mínimo guardado")}
          onEdit={target.key.startsWith("item|") ? () => { const it = items.find((i) => `item|${i.id}` === target.key); setTarget(null); if (it) setEditing(it); } : undefined} />}
      </Sheet>

      <Sheet open={editing !== null} onClose={() => { setEditing(null); setError(null); }} title={editing === "new" ? "Nuevo artículo" : "Editar artículo"}>
        {editing !== null && (
          <form className="grid grid-cols-2 gap-3" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const s = (k: string) => String(fd.get(k) ?? "");
            run(() => saveStockItem({
              id: editing === "new" ? undefined : editing.id, businessId, name: s("name"), variant: s("variant"),
              productId: s("product") || null, matchColor: s("color"), matchSize: s("size"),
              quantity: editing === "new" ? Number(s("quantity") || 0) : undefined, min: Number(s("min") || 0),
            }), () => setEditing(null), "Artículo guardado");
          }}>
            <Field label="Nombre" htmlFor="si-name" className="col-span-2"><Input id="si-name" name="name" required maxLength={80} defaultValue={editing === "new" ? "" : editing.name} placeholder="Camiseta negra, Bolsas de envío…" /></Field>
            <Field label="Variante (opcional)" htmlFor="si-var" className="col-span-2"><Input id="si-var" name="variant" maxLength={60} defaultValue={editing === "new" ? "" : editing.variant} placeholder="M, 10×15, Azul…" /></Field>
            {editing === "new" && <Field label="Tienes ahora" htmlFor="si-q"><Input id="si-q" name="quantity" inputMode="numeric" defaultValue="0" /></Field>}
            <Field label="Mínimo" htmlFor="si-min" className={editing === "new" ? "" : "col-span-2"}><Input id="si-min" name="min" inputMode="numeric" defaultValue={editing === "new" ? "0" : String(editing.min_quantity)} /></Field>
            <fieldset className="col-span-2 grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
              <legend className="px-1 text-xs text-muted">Vínculo con pedidos (opcional)</legend>
              <Field label="Producto del catálogo" htmlFor="si-prod" className="col-span-2">
                <Select id="si-prod" name="product" defaultValue={editing === "new" ? "" : editing.product_id ?? ""}>
                  <option value="">Por nombre (igual que en el pedido)</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <Field label="Solo color" htmlFor="si-color"><Input id="si-color" name="color" maxLength={40} defaultValue={editing === "new" ? "" : editing.match_color ?? ""} placeholder="Negra" /></Field>
              <Field label="Solo talla" htmlFor="si-size"><Input id="si-size" name="size" maxLength={20} defaultValue={editing === "new" ? "" : editing.match_size ?? ""} placeholder="M" /></Field>
              <p className="col-span-2 text-xs text-muted">Los pedidos «Sin hacer» y «Sin llegar» con ese producto (y color/talla si los pones) reservan este artículo.</p>
            </fieldset>
            {error && <p role="alert" className="col-span-2 text-sm text-danger">{error}</p>}
            {editing !== "new" && <Button type="button" variant="secondary" disabled={busy} onClick={() => { if (confirm("¿Borrar este artículo? Sus movimientos se conservan.")) run(() => deleteStockItem(editing.id, businessId), () => setEditing(null), "Artículo borrado"); }}><Trash2 className="size-4" aria-hidden /> Borrar</Button>}
            <Button type="submit" disabled={busy} className={editing === "new" ? "col-span-2" : ""}>Guardar</Button>
          </form>
        )}
      </Sheet>
    </div>
  );
}

function AdjustForm({ line, busy, error, onAdjust, onMin, onEdit }: {
  line: StockLine; busy: boolean; error: string | null;
  onAdjust: (mode: "in" | "out" | "set", amount: number, reason: string) => void; onMin: (min: number) => void; onEdit?: () => void;
}) {
  const [amount, setAmount] = useState(String(line.missing || 1));
  const [reason, setReason] = useState("");
  const [min, setMin] = useState(String(line.min));
  const n = Math.max(0, parseInt(amount, 10) || 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm">
        <p className="font-semibold">{line.label}</p>
        <p className="text-muted">Tienes {line.base} · {line.reserved} reservado en pedidos · disponible <strong className={tone(line)}>{line.available}</strong>{line.missing > 0 && <> · <span className="text-bad">faltan {line.missing}</span></>}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unidades" htmlFor="adj-n"><Input id="adj-n" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Motivo (opcional)" htmlFor="adj-r"><Input id="adj-r" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Compra, rotura…" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button disabled={busy || n === 0} onClick={() => onAdjust("in", n, reason)}><ArrowDownToLine className="size-4" aria-hidden /> Entrada</Button>
        <Button variant="secondary" disabled={busy || n === 0} onClick={() => onAdjust("out", n, reason)}><ArrowUpFromLine className="size-4" aria-hidden /> Salida</Button>
        <Button variant="secondary" disabled={busy} onClick={() => onAdjust("set", n, reason || "Recuento")} title="Deja «Tienes» exactamente en esta cantidad"><SlidersHorizontal className="size-4" aria-hidden /> Fijar</Button>
      </div>
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); onMin(Math.max(0, parseInt(min, 10) || 0)); }}>
        <Field label="Stock mínimo (0 = sin mínimo)" htmlFor="adj-min" className="flex-1"><Input id="adj-min" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} /></Field>
        <Button type="submit" variant="secondary" disabled={busy}>Guardar mínimo</Button>
      </form>
      {onEdit && <Button type="button" variant="ghost" onClick={onEdit}><Pencil className="size-4" aria-hidden /> Editar artículo</Button>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

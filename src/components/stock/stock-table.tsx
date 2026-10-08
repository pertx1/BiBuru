"use client";

import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Calculator, CheckCircle2, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { addDesign, addModel, removeDesign, removeModel } from "@/app/(app)/negocios/actions-production";
import { adjustStock, deleteStockItem, previewStockRecalc, runStockRecalc, saveStockItem, setStockMin, stockHistory, type StockMove } from "@/app/(app)/negocios/stock-actions";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/dates";
import { garmentLabel } from "@/lib/production/stock";
import { DEFAULT_SIZES, sizeRank } from "@/lib/production/text";
import { shortages, type StockLine } from "@/lib/stock/shortage";
import type { RecalcPreview } from "@/lib/stock/service";
import { cn } from "@/lib/utils";

type Item = { id: string; name: string; variant: string; product_id: string | null; match_color: string | null; match_size: string | null; quantity: number; min_quantity: number };
type Move = { id: string; label: string; kind: string; delta: number; reason: string | null; moved_on: string; order_id: string | null };
type CatalogInfo = { models: string[]; designs: { name: string; kind: "standalone" | "paired" }[] };

/** Mismo código de color que la tabla de Producción: rojo si falta, ámbar en 0 o por debajo del mínimo. */
const tone = (l: StockLine) => (l.available < 0 ? "text-danger font-semibold" : l.needed ? "text-amber-600 dark:text-amber-400 font-semibold" : "");
const lack = (l: StockLine) => (l.missing > 0 ? `faltan ${l.missing}` : "a 0");
const VARIANT_LABEL: Record<string, string> = { UNICO: "Único", BLANCO: "Blanco", NEGRO: "Negro" };

/**
 * Stock del negocio en tabla (la de Producción, la única versión): «Pedir ya», prendas por modelo y talla, DTF y materiales/productos.
 * Cada casilla abre el ajuste (entrada, salida, fijar, mínimo) con el historial de movimientos y el enlace a cada pedido.
 * El número es lo disponible: lo que tienes (ya descontados los pedidos nuevos) − lo que reservan los pedidos anteriores sin vincular.
 */
export function StockTable({ businessId, lines, items, production, catalog, products, moves, taskByKey }: {
  businessId: string; lines: StockLine[]; items: Item[]; production: boolean; catalog: CatalogInfo | null;
  products: { id: string; name: string }[]; moves: Move[]; taskByKey: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [target, setTarget] = useState<StockLine | null>(null);
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [recalcOpen, setRecalcOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = shortages(lines);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: () => void, msg?: string) => start(async () => {
    const r = await fn();
    if (!r.ok) return setError(r.error ?? "Error");
    setError(null); done(); if (msg) toast({ message: msg }); router.refresh();
  });

  const shirts = lines.filter((l) => l.group === "prendas");
  const dtfs = lines.filter((l) => l.group === "dtf");
  const generic = lines.filter((l) => l.group === "articulos");
  const models = [...new Set(shirts.map((l) => l.key.split("|")[1]))];
  const sizes = [...new Set([...DEFAULT_SIZES, ...shirts.map((l) => l.key.split("|")[2])])].sort((a, b) => sizeRank(a) - sizeRank(b));
  const designs = [...new Set(dtfs.map((l) => l.key.split("|")[1]))];
  const variants = ["UNICO", "BLANCO", "NEGRO"].filter((v) => dtfs.some((l) => l.key.endsWith(`|${v}`)));
  const cell = (l: StockLine | undefined, text?: string) => l
    ? <button type="button" onClick={() => setTarget(l)} className={cn("min-h-11 w-full min-w-8 rounded-lg px-1 tabular-nums hover:bg-surface-2 md:min-h-9", tone(l))} aria-label={`${l.label}: ${l.available}`}>{text ?? l.available}</button>
    : <span className="text-muted">–</span>;

  return (
    <div className="flex flex-col gap-5">
      {missing.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl bg-good/5 p-4"><CheckCircle2 className="size-5 text-good" aria-hidden /><div><p className="font-semibold text-good">Todo en orden</p><p className="text-xs text-muted">No falta nada: todo está por encima de 0 y de su mínimo.</p></div></div>
      ) : (
        <section className="rounded-xl bg-bad/5 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-bad"><AlertTriangle className="size-4" aria-hidden /> Pedir ya</h2>
          <p className="mb-2 text-xs text-muted">Cada artículo tiene su tarea «Pedir …» en Tareas, para hoy (se actualiza y se completa sola cuando hay stock).</p>
          <ul className="divide-y divide-border">
            {missing.map((l) => (
              <li key={l.key} className="flex min-h-12 items-center gap-2 py-1.5 text-sm">
                <button type="button" onClick={() => setTarget(l)} className="min-w-0 flex-1 truncate text-left font-medium">{l.label}</button>
                <span className="shrink-0 text-xs text-muted">{l.reserved > 0 ? `${l.reserved} reservado` : l.min ? `mín. ${l.min}` : ""}</span>
                <span className="w-20 shrink-0 text-right font-semibold tabular-nums text-bad">{lack(l)}</span>
                {taskByKey[l.key] && <Link href={`/tareas/${taskByKey[l.key]}`} className="inline-flex min-h-11 shrink-0 items-center px-1 text-xs font-medium text-accent">Tarea</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {production && <Button variant="secondary" onClick={() => setCatalogOpen(true)}>Catálogo</Button>}
        <Button variant="secondary" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Añadir artículo</Button>
        <Button variant="secondary" onClick={() => setRecalcOpen(true)}><Calculator className="size-4" aria-hidden /> Recalcular desde pedidos</Button>
      </div>

      {production && (
        <section className="rounded-xl bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold">Prendas · {shirts.reduce((s, l) => s + l.available, 0)} en total</h2>
          {models.length === 0 ? <p className="text-sm text-muted">Aún no hay modelos. Pulsa «Catálogo» para añadir «Blanca», «Negra»…</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted"><th className="py-1 pr-2 font-medium">Modelo</th>{sizes.map((s) => <th key={s} className="px-1 py-1 text-center font-medium">{s}</th>)}</tr></thead>
                <tbody>
                  {models.map((m) => (
                    <tr key={m} className="border-t border-border">
                      <td className="whitespace-nowrap py-1 pr-1 text-xs font-medium sm:text-sm">{garmentLabel(m)}</td>
                      {sizes.map((size) => <td key={size} className="px-0.5 py-0.5 text-center">{cell(shirts.find((l) => l.key === `tshirt|${m}|${size}`))}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {production && (
        <section className="rounded-xl bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold">DTF · {dtfs.reduce((s, l) => s + l.available, 0)} en total</h2>
          {designs.length === 0 ? <p className="text-sm text-muted">Sin diseños. Añádelos en «Catálogo».</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted"><th className="py-1 pr-2 font-medium">Diseño</th>{variants.map((v) => <th key={v} className="px-1 py-1 text-center font-medium">{VARIANT_LABEL[v]}</th>)}</tr></thead>
                <tbody>
                  {designs.map((d) => (
                    <tr key={d} className="border-t border-border">
                      <td className="py-1 pr-1 text-xs font-medium sm:text-sm">{d}</td>
                      {variants.map((v) => <td key={v} className="px-0.5 py-0.5 text-center">{cell(dtfs.find((l) => l.key === `dtf|${d}|${v}`))}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Materiales y productos</h2>
        {generic.length === 0 ? (
          <p className="text-sm text-muted">{production ? "Bolsas, etiquetas, productos terminados… lo que quieras controlar además de prendas y DTF." : "Añade lo que quieras controlar: productos por talla y color, materiales…"} Luego, en cada pedido, elige el artículo y se descontará solo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="py-1 pr-2 font-medium">Artículo</th><th className="px-1 py-1 text-right font-medium">Tienes</th><th className="px-1 py-1 text-right font-medium">Reservado</th><th className="px-1 py-1 text-right font-medium">Disponible</th><th className="px-1 py-1 text-right font-medium">Mínimo</th></tr></thead>
              <tbody>
                {generic.map((l) => (
                  <tr key={l.key} className="border-t border-border">
                    <td className="py-1 pr-1"><button type="button" onClick={() => setTarget(l)} className="min-h-11 w-full text-left font-medium md:min-h-9">{l.label}</button></td>
                    <td className="px-1 text-right tabular-nums">{l.base}</td>
                    <td className="px-1 text-right tabular-nums text-muted">{l.reserved || "–"}</td>
                    <td className="px-1 text-right">{cell(l)}</td>
                    <td className="px-1 text-right tabular-nums text-muted">{l.min || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Últimos movimientos</h2>
        {moves.length === 0 ? <p className="text-sm text-muted">Aún no hay movimientos.</p> : (
          <ul className="divide-y divide-border text-sm">
            {moves.map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-1.5">
                <span className="w-20 shrink-0 text-xs tabular-nums text-muted">{formatDate(m.moved_on)}</span>
                <span className="min-w-0 flex-1 truncate">{m.label}{m.reason ? <span className="text-muted"> · {m.reason}</span> : null}</span>
                {m.order_id && <Link href={`/negocios/${businessId}/pedidos?abrir=${m.order_id}`} className="inline-flex min-h-11 shrink-0 items-center text-xs text-accent md:min-h-9">Ver pedido</Link>}
                <span className={cn("w-12 shrink-0 text-right font-semibold tabular-nums", m.delta > 0 ? "text-good" : "text-bad")}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Sheet open={!!target} onClose={() => { setTarget(null); setError(null); }} title="Ajustar stock">
        {target && <AdjustForm key={target.key} businessId={businessId} line={target} busy={busy} error={error}
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
            <Field label="Nombre" htmlFor="si-name" className="col-span-2"><Input id="si-name" name="name" required maxLength={80} defaultValue={editing === "new" ? "" : editing.name} placeholder="Sudadera gris, Bolsas de envío…" /></Field>
            <Field label="Variante (opcional)" htmlFor="si-var" className="col-span-2"><Input id="si-var" name="variant" maxLength={60} defaultValue={editing === "new" ? "" : editing.variant} placeholder="M, 10×15, Azul…" /></Field>
            {editing === "new" && <Field label="Tienes ahora" htmlFor="si-q"><Input id="si-q" name="quantity" inputMode="numeric" defaultValue="0" /></Field>}
            <Field label="Mínimo" htmlFor="si-min" className={editing === "new" ? "" : "col-span-2"}><Input id="si-min" name="min" inputMode="numeric" defaultValue={editing === "new" ? "0" : String(editing.min_quantity)} /></Field>
            <fieldset className="col-span-2 grid grid-cols-2 gap-3 rounded-lg bg-fill p-3">
              <legend className="px-1 text-xs text-muted">Reconocerlo solo en los pedidos (opcional)</legend>
              <Field label="Producto del catálogo" htmlFor="si-prod" className="col-span-2">
                <Select id="si-prod" name="product" defaultValue={editing === "new" ? "" : editing.product_id ?? ""}>
                  <option value="">Por nombre (igual que en el pedido)</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <Field label="Solo color" htmlFor="si-color"><Input id="si-color" name="color" maxLength={40} defaultValue={editing === "new" ? "" : editing.match_color ?? ""} placeholder="Negra" /></Field>
              <Field label="Solo talla" htmlFor="si-size"><Input id="si-size" name="size" maxLength={20} defaultValue={editing === "new" ? "" : editing.match_size ?? ""} placeholder="M" /></Field>
              <p className="col-span-2 text-xs text-muted">Si una línea de pedido coincide, se vincula sola y descuenta este artículo. También puedes elegirlo a mano en el pedido.</p>
            </fieldset>
            {error && <p role="alert" className="col-span-2 text-sm text-danger">{error}</p>}
            {editing !== "new" && <Button type="button" variant="secondary" disabled={busy} onClick={() => { if (confirm("¿Borrar este artículo? Sus movimientos se conservan.")) run(() => deleteStockItem(editing.id, businessId), () => setEditing(null), "Artículo borrado"); }}><Trash2 className="size-4" aria-hidden /> Borrar</Button>}
            <Button type="submit" disabled={busy} className={editing === "new" ? "col-span-2" : ""}>Guardar</Button>
          </form>
        )}
      </Sheet>

      {production && catalog && (
        <Sheet open={catalogOpen} onClose={() => setCatalogOpen(false)} title="Catálogo de producción">
          <div className="flex flex-col gap-5">
            <section><h3 className="mb-2 text-sm font-semibold">Modelos de prenda</h3>
              <ul className="mb-2 flex flex-wrap gap-2">{catalog.models.map((m) => (
                <li key={m} className="flex items-center gap-1 rounded-full bg-fill py-0.5 pl-3 pr-1 text-sm">{m}
                  <button type="button" aria-label={`Quitar ${m}`} className="flex size-9 items-center justify-center text-muted hover:text-danger" onClick={() => run(() => removeModel(businessId, m), () => {})}><Trash2 className="size-4" aria-hidden /></button></li>))}</ul>
              <form className="flex gap-2" action={(fd) => { const n = String(fd.get("m") ?? "").trim(); if (n) run(() => addModel(businessId, n), () => {}); }}>
                <Input name="m" placeholder="Blanca, Negra, Sudadera negra…" maxLength={40} aria-label="Nuevo modelo" /><Button type="submit">Añadir</Button>
              </form>
              <p className="mt-1 text-xs text-muted">Se crea con las tallas S, M, L, XL y XXL.</p>
            </section>
            <section><h3 className="mb-2 text-sm font-semibold">Diseños DTF</h3>
              <ul className="mb-2 flex flex-wrap gap-2">{catalog.designs.map((d) => (
                <li key={d.name} className="flex items-center gap-1 rounded-full bg-fill py-0.5 pl-3 pr-1 text-sm">{d.name}<span className="text-xs text-muted">({d.kind === "standalone" ? "único" : "blanco/negro"})</span>
                  <button type="button" aria-label={`Quitar ${d.name}`} className="flex size-9 items-center justify-center text-muted hover:text-danger" onClick={() => run(() => removeDesign(businessId, d.name), () => {})}><Trash2 className="size-4" aria-hidden /></button></li>))}</ul>
              <form className="grid grid-cols-[1fr_auto] gap-2" action={(fd) => { const n = String(fd.get("d") ?? "").trim(); if (n) run(() => addDesign(businessId, n, fd.get("k") === "standalone" ? "standalone" : "paired"), () => {}); }}>
                <Input name="d" placeholder="Nombre del diseño" maxLength={60} aria-label="Nuevo diseño" /><Button type="submit">Añadir</Button>
                <Select name="k" defaultValue="paired" aria-label="Tipo de diseño"><option value="paired">Blanco y negro (según prenda)</option><option value="standalone">Único (no depende de la prenda)</option></Select>
              </form>
            </section>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          </div>
        </Sheet>
      )}

      <Sheet open={recalcOpen} onClose={() => setRecalcOpen(false)} title="Recalcular desde pedidos">
        {recalcOpen && <RecalcPanel businessId={businessId} onDone={() => { setRecalcOpen(false); router.refresh(); }} />}
      </Sheet>
    </div>
  );
}

function AdjustForm({ businessId, line, busy, error, onAdjust, onMin, onEdit }: {
  businessId: string; line: StockLine; busy: boolean; error: string | null;
  onAdjust: (mode: "in" | "out" | "set", amount: number, reason: string) => void; onMin: (min: number) => void; onEdit?: () => void;
}) {
  const [amount, setAmount] = useState(String(line.missing || 1));
  const [reason, setReason] = useState("");
  const [min, setMin] = useState(String(line.min));
  const [history, setHistory] = useState<StockMove[] | null>(null);
  useEffect(() => { stockHistory(businessId, line.key).then(setHistory).catch(() => setHistory([])); }, [businessId, line.key]);
  const n = Math.max(0, parseInt(amount, 10) || 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm">
        <p className="font-semibold">{line.label}</p>
        <p className="text-muted">Tienes {line.base}{line.reserved ? ` · ${line.reserved} reservado por pedidos anteriores` : ""} · disponible <strong className={tone(line)}>{line.available}</strong>{line.needed && <> · <span className="text-bad">{lack(line)}</span></>}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unidades" htmlFor="adj-n"><Input id="adj-n" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Motivo (opcional)" htmlFor="adj-r"><Input id="adj-r" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Compra, rotura…" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button disabled={busy || n === 0} onClick={() => onAdjust("in", n, reason)}><ArrowDownToLine className="size-4" aria-hidden /> Sumar</Button>
        <Button variant="secondary" disabled={busy || n === 0} onClick={() => onAdjust("out", n, reason)}><ArrowUpFromLine className="size-4" aria-hidden /> Restar</Button>
        <Button variant="secondary" disabled={busy} onClick={() => onAdjust("set", n, reason || "Recuento")} title="Deja «Tienes» exactamente en esta cantidad"><SlidersHorizontal className="size-4" aria-hidden /> Fijar</Button>
      </div>
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); onMin(Math.max(0, parseInt(min, 10) || 0)); }}>
        <Field label="Stock mínimo (0 = sin mínimo)" htmlFor="adj-min" className="flex-1"><Input id="adj-min" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} /></Field>
        <Button type="submit" variant="secondary" disabled={busy}>Guardar mínimo</Button>
      </form>
      {onEdit && <Button type="button" variant="ghost" onClick={onEdit}><Pencil className="size-4" aria-hidden /> Editar artículo</Button>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <section>
        <h3 className="mb-1 text-sm font-semibold">Historial</h3>
        {history === null ? <p className="text-sm text-muted">Cargando…</p> : history.length === 0 ? <p className="text-sm text-muted">Sin movimientos todavía.</p> : (
          <ul className="divide-y divide-border text-sm">
            {history.map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-1.5">
                <span className="w-20 shrink-0 text-xs tabular-nums text-muted">{formatDate(m.moved_on)}</span>
                <span className="min-w-0 flex-1 truncate">{m.reason ?? (m.kind === "entrada" ? "Entrada" : m.kind === "salida" ? "Salida" : "Ajuste")}{m.order_label ? <span className="text-muted"> · {m.order_label}</span> : null}</span>
                {m.order_id && <Link href={`/negocios/${businessId}/pedidos?abrir=${m.order_id}`} className="inline-flex min-h-11 shrink-0 items-center text-xs text-accent md:min-h-9">Ver pedido</Link>}
                <span className={cn("w-12 shrink-0 text-right font-semibold tabular-nums", m.delta > 0 ? "text-good" : "text-bad")}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Los pedidos anteriores no descuentan solos: aquí se ve qué pasaría y se aplica si quieres (una sola vez). */
function RecalcPanel({ businessId, onDone }: { businessId: string; onDone: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"pendientes" | "desde">("pendientes");
  const [from, setFrom] = useState("");
  const [preview, setPreview] = useState<RecalcPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const input = { businessId, mode, from: mode === "desde" ? from || null : null };
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-muted">Los pedidos de antes del descuento automático no restan del stock. Si quieres que lo hagan, elige cuáles, mira la vista previa y pulsa «Aplicar». Cada pedido solo se descuenta una vez.</p>
      <fieldset className="flex flex-col gap-2">
        <label className="flex min-h-11 items-center gap-3"><input type="radio" name="rc" checked={mode === "pendientes"} onChange={() => { setMode("pendientes"); setPreview(null); }} className="size-5" /> Solo los pendientes («Sin hacer» y «Sin llegar»)</label>
        <label className="flex min-h-11 items-center gap-3"><input type="radio" name="rc" checked={mode === "desde"} onChange={() => { setMode("desde"); setPreview(null); }} className="size-5" /> Todos los no cancelados desde una fecha</label>
        {mode === "desde" && <Field label="Desde" htmlFor="rc-from"><Input id="rc-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreview(null); }} /></Field>}
      </fieldset>
      <Button variant="secondary" disabled={busy} onClick={() => start(async () => { const r = await previewStockRecalc(input); if (r.ok) { setPreview(r.preview); setError(null); } else setError(r.error); })}>Ver vista previa</Button>
      {preview && (
        <div className="flex flex-col gap-2">
          <p><strong>{preview.orders}</strong> {preview.orders === 1 ? "pedido" : "pedidos"} pasarían a descontar.{preview.unlinkedLines > 0 && <> {preview.unlinkedLines} {preview.unlinkedLines === 1 ? "línea no encaja" : "líneas no encajan"} con ningún artículo y no descontará{preview.unlinkedLines === 1 ? "" : "n"}.</>}</p>
          {preview.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="text-left text-xs text-muted"><th className="py-1 font-medium">Artículo</th><th className="text-right font-medium">Tienes</th><th className="text-right font-medium">Resta</th><th className="text-right font-medium">Quedaría</th></tr></thead>
                <tbody>{preview.rows.map((r) => (
                  <tr key={r.key} className="border-t border-border"><td className="py-1.5">{r.label}</td><td className="text-right tabular-nums">{r.now}</td><td className="text-right tabular-nums text-bad">−{r.minus}</td><td className={cn("text-right font-semibold tabular-nums", r.after < 0 && "text-bad")}>{r.after}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <Button disabled={busy || preview.orders === 0} onClick={() => { if (confirm("¿Descontar estos pedidos del stock? Solo se hace una vez por pedido.")) start(async () => { const r = await runStockRecalc(input); if (r.ok) { toast({ message: `Hecho: ${r.orders ?? 0} pedidos descontados` }); onDone(); } else setError(r.error); }); }}>Aplicar</Button>
        </div>
      )}
      {error && <p role="alert" className="text-danger">{error}</p>}
    </div>
  );
}

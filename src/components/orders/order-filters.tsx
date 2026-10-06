"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatDate } from "@/lib/dates";
import { FILTER_KEYS, PAY_LABEL } from "@/lib/orders/payments";
import { ORDER_STATUSES, ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/schemas";
import { cn } from "@/lib/utils";

const storageKey = (businessId: string) => `biburu:order-filters:${businessId}`;
const DATE_LABEL: Record<string, string> = { hoy: "Hoy", semana: "Esta semana", mes: "Este mes" };
const PAY_KEYS = ["pending", "partial", "paid", "unreviewed"] as const;
const field = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base md:min-h-9 md:text-sm";

type Values = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

/** Filtros de pedidos en la URL: buscador, hoja «Filtros» (móvil) / fila (escritorio), etiquetas y «Limpiar todo». Recuerda el último filtro. */
export function OrderFilters({ businessId, customers, channels, products }: { businessId: string; customers: string[]; channels: string[]; products: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current: Values = Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k) ?? ""]).filter(([, v]) => v));
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(current.q ?? "");

  const apply = (vals: Values) => {
    const next = new URLSearchParams();
    for (const k of ["vista"]) { const v = sp.get(k); if (v) next.set(k, v); }
    for (const k of FILTER_KEYS) { const v = vals[k]?.trim(); if (v) next.set(k, v); }
    if (next.get("fecha") !== "rango") { next.delete("desde"); next.delete("hasta"); }
    try {
      const only = Object.fromEntries(FILTER_KEYS.map((k) => [k, next.get(k)]).filter(([, v]) => v));
      if (Object.keys(only).length) localStorage.setItem(storageKey(businessId), JSON.stringify(only));
      else localStorage.removeItem(storageKey(businessId));
    } catch { /* sin almacenamiento */ }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Al entrar sin filtros en la URL se recupera el último usado.
  useEffect(() => {
    if (FILTER_KEYS.some((k) => sp.get(k)) || sp.get("abrir") || sp.get("nuevo")) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(businessId)) ?? "null") as Values | null;
      if (saved && Object.keys(saved).length) apply(saved);
    } catch { /* nada guardado */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chips: { key: string; label: string; drop: (keyof Values)[] }[] = [];
  if (current.q) chips.push({ key: "q", label: `«${current.q}»`, drop: ["q"] });
  if (current.estado) chips.push({ key: "estado", label: ORDER_STATUS_LABEL[current.estado as OrderStatus] ?? current.estado, drop: ["estado"] });
  if (current.pago) chips.push({ key: "pago", label: `Pago: ${PAY_LABEL[current.pago as keyof typeof PAY_LABEL] ?? current.pago}`, drop: ["pago"] });
  if (current.fecha && current.fecha !== "rango") chips.push({ key: "fecha", label: DATE_LABEL[current.fecha] ?? current.fecha, drop: ["fecha"] });
  if (current.fecha === "rango" || (!current.fecha && (current.desde || current.hasta)))
    chips.push({ key: "rango", label: `${current.desde ? formatDate(current.desde) : "…"} – ${current.hasta ? formatDate(current.hasta) : "…"}`, drop: ["fecha", "desde", "hasta"] });
  if (current.cliente) chips.push({ key: "cliente", label: `Cliente: ${current.cliente}`, drop: ["cliente"] });
  if (current.producto) chips.push({ key: "producto", label: `Producto: ${current.producto}`, drop: ["producto"] });
  if (current.canal) chips.push({ key: "canal", label: `Canal: ${current.canal}`, drop: ["canal"] });
  const dropChip = (drop: (keyof Values)[]) => { const v = { ...current }; for (const d of drop) delete v[d]; if (drop.includes("q")) setQ(""); apply(v); };
  const advancedCount = chips.filter((c) => c.key !== "q").length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <form className="relative flex-1" onSubmit={(e) => { e.preventDefault(); apply({ ...current, q }); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q !== (current.q ?? "") && apply({ ...current, q })}
            placeholder="Buscar cliente, nº o producto" aria-label="Buscar pedidos" className={cn(field, "pl-9")} enterKeyHint="search" />
        </form>
        <Button type="button" variant="secondary" onClick={() => setOpen(true)} className="shrink-0">
          <SlidersHorizontal className="size-4" aria-hidden /> Filtros{advancedCount > 0 && <span className="ml-1 rounded-full bg-accent px-1.5 text-xs text-accent-foreground">{advancedCount}</span>}
        </Button>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button key={c.key} type="button" onClick={() => dropChip(c.drop)} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border bg-surface-2 px-3 text-xs font-medium" aria-label={`Quitar filtro ${c.label}`}>
              {c.label} <X className="size-3.5" aria-hidden />
            </button>
          ))}
          <button type="button" onClick={() => { setQ(""); apply({}); }} className="min-h-9 px-2 text-xs font-semibold text-accent">Limpiar todo</button>
        </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Filtrar pedidos">
        {open && (
          <form className="grid grid-cols-2 gap-3" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            apply({ q, ...Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])) });
            setOpen(false);
          }}>
            <label className="flex flex-col gap-1 text-xs text-muted">Estado del pedido
              <select name="estado" defaultValue={current.estado ?? ""} className={field}><option value="">Todos</option>{ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">Estado de pago
              <select name="pago" defaultValue={current.pago ?? ""} className={field}><option value="">Todos</option>{PAY_KEYS.map((s) => <option key={s} value={s}>{PAY_LABEL[s]}</option>)}</select>
            </label>
            <DateFields current={current} />
            <label className="flex flex-col gap-1 text-xs text-muted">Cliente
              <input name="cliente" list="f-customers" defaultValue={current.cliente} className={field} autoComplete="off" />
              <datalist id="f-customers">{customers.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">Producto
              <input name="producto" list="f-products" defaultValue={current.producto} className={field} autoComplete="off" />
              <datalist id="f-products">{products.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">Canal
              <input name="canal" list="f-channels" defaultValue={current.canal} className={field} autoComplete="off" />
              <datalist id="f-channels">{channels.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <Button type="button" variant="secondary" onClick={() => { setQ(""); apply({}); setOpen(false); }}>Limpiar todo</Button>
            <Button type="submit">Aplicar</Button>
          </form>
        )}
      </Sheet>
    </div>
  );
}

function DateFields({ current }: { current: Values }) {
  const [preset, setPreset] = useState(current.fecha ?? (current.desde || current.hasta ? "rango" : ""));
  return (
    <div className="col-span-2 flex flex-col gap-2">
      <span className="text-xs text-muted">Fechas</span>
      <input type="hidden" name="fecha" value={preset} />
      <div className="flex flex-wrap gap-1.5">
        {[["", "Todas"], ["hoy", "Hoy"], ["semana", "Esta semana"], ["mes", "Este mes"], ["rango", "Rango"]].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={preset === k} onClick={() => setPreset(k)}
            className={cn("min-h-10 rounded-full border px-3 text-sm", preset === k ? "border-accent bg-accent/15 font-semibold" : "border-border text-muted")}>{l}</button>
        ))}
      </div>
      {preset === "rango" && (
        <div className="grid grid-cols-2 gap-2">
          <input type="date" name="desde" defaultValue={current.desde} aria-label="Desde" className={field} />
          <input type="date" name="hasta" defaultValue={current.hasta} aria-label="Hasta" className={field} />
        </div>
      )}
    </div>
  );
}

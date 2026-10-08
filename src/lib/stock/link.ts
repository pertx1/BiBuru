/**
 * Qué descuenta del stock cada línea de pedido (lógica pura, la misma en el formulario y en el servidor).
 * - Si la línea tiene un artículo elegido de la lista (`stock_key`), descuenta ese artículo.
 * - Si no, se reconoce sola: en Producción, prenda (modelo + talla) y/o DTF del diseño; si no, un artículo de Stock
 *   cuyo producto o nombre (y color/talla si los fija) coincide.
 * - Si no encaja con nada: «sin vincular al stock» (no descuenta).
 */
import type { Catalog, DtfVariant, Rules } from "@/lib/production/catalog";
import { garmentLabel, resolveStockEffect } from "@/lib/production/stock";
import { itemLabel, lineMatches, type GenericItem } from "./shortage";

export type StockEffect = { key: string; label: string; qty: number };
export type StockOption = { key: string; label: string; group: "prendas" | "dtf" | "articulos" };
/** Lo que hace falta para resolver líneas de un negocio. */
export type StockLinkContext = { production: { catalog: Catalog; rules: Rules } | null; items: GenericItem[]; options: StockOption[] };
export type LineInput = { stock_key?: string | null; product_id?: string | null; product_name: string; color?: string | null; size?: string | null; quantity: number };

const DTF_LABEL: Record<DtfVariant, string> = { UNICO: "", BLANCO: " blanco", NEGRO: " negro" };
export const tshirtKey = (model: string, size: string) => `tshirt|${model}|${size}`;
export const dtfKey = (name: string, variant: string) => `dtf|${name}|${variant}`;
export const itemKey = (id: string) => `item|${id}`;

/** Lista de artículos para elegir en el pedido (prendas, DTF y materiales/productos). */
export function stockOptions(production: { catalog: Catalog; rows: { tshirts: { model: string; size: string }[]; dtfs: { name: string; variant: DtfVariant }[] } } | null, items: GenericItem[]): StockOption[] {
  const out: StockOption[] = [];
  if (production) {
    const kindOf = new Map(production.catalog.designs.map((d) => [d.name, d.kind]));
    for (const t of production.rows.tshirts) out.push({ key: tshirtKey(t.model, t.size), label: `${garmentLabel(t.model)} ${t.size}`, group: "prendas" });
    for (const d of production.rows.dtfs) {
      const kind = kindOf.get(d.name);
      if (!kind || (kind === "standalone") !== (d.variant === "UNICO")) continue;
      out.push({ key: dtfKey(d.name, d.variant), label: `DTF ${d.name}${DTF_LABEL[d.variant]}`, group: "dtf" });
    }
  }
  for (const i of items) out.push({ key: itemKey(i.id), label: itemLabel(i), group: "articulos" });
  return out;
}

/** Efectos de una línea sobre el stock (unidades totales). [] = sin vincular. */
export function resolveLineStock(line: LineInput, ctx: StockLinkContext): StockEffect[] {
  const qty = Math.max(0, Math.trunc(line.quantity) || 0);
  if (qty === 0) return [];
  if (line.stock_key) {
    const opt = ctx.options.find((o) => o.key === line.stock_key);
    return opt ? [{ key: opt.key, label: opt.label, qty }] : [];
  }
  const effects: StockEffect[] = [];
  if (ctx.production) {
    const e = resolveStockEffect({ product_name: line.product_name, color: line.color ?? null, size: line.size ?? null }, ctx.production.catalog, ctx.production.rules);
    const add = (key: string) => { const opt = ctx.options.find((o) => o.key === key); if (opt) effects.push({ key, label: opt.label, qty }); };
    if (e.tshirt) add(tshirtKey(e.tshirt.model, e.tshirt.size));
    if (e.dtf) add(dtfKey(e.dtf.name, e.dtf.variant));
    if (effects.length) return effects;
  }
  const pl = { product_id: line.product_id ?? null, product_name: line.product_name, color: line.color ?? null, size: line.size ?? null, quantity: qty, order_date: "" };
  const item = ctx.items.find((i) => lineMatches(i, pl));
  return item ? [{ key: itemKey(item.id), label: itemLabel(item), qty }] : [];
}

/** Suma por artículo de varias líneas (para avisar de stock insuficiente antes de guardar). */
export function totalByKey(effects: StockEffect[][]): Map<string, { label: string; qty: number }> {
  const m = new Map<string, { label: string; qty: number }>();
  for (const e of effects.flat()) { const x = m.get(e.key); m.set(e.key, { label: e.label, qty: (x?.qty ?? 0) + e.qty }); }
  return m;
}

/** Texto corto para la línea del formulario. */
export const effectsText = (effects: StockEffect[]) => (effects.length ? `Descuenta: ${effects.map((e) => `${e.qty} × ${e.label}`).join(" + ")}` : "Sin vincular al stock");

/**
 * Stock que falta: lógica pura (probada en tests), válida en cliente y servidor.
 * Disponible = lo que tienes − lo reservado por pedidos pendientes. Falta = lo que haga falta para cubrir los pedidos
 * y además llegar al mínimo: max(0, mínimo − disponible).
 */
import { addDays } from "@/lib/dates";
import { normalizeText } from "@/lib/production/text";

export type StockGroup = "prendas" | "dtf" | "articulos";
export const GROUP_LABEL: Record<StockGroup, string> = { prendas: "Prendas", dtf: "DTF", articulos: "Materiales y productos" };

export type StockEntry = {
  key: string;            // tshirt|modelo|talla · dtf|diseño|variante · item|<id>
  group: StockGroup;
  label: string;          // «Camiseta negra · talla M»
  base: number;           // lo que tienes
  min: number;
  reserved: number;       // lo que piden los pedidos pendientes
  oldestOrder: string | null;  // pedido pendiente más antiguo que lo necesita
};
export type StockLine = StockEntry & { available: number; missing: number };

/** Días que se da de margen desde el pedido más antiguo que espera el artículo (no hay fecha de entrega en los pedidos). */
export const DUE_MARGIN_DAYS = 3;
/** Si solo está bajo el mínimo (ningún pedido espera), la tarea vence en una semana. */
export const MIN_ONLY_DAYS = 7;

export function withMissing(e: StockEntry): StockLine {
  const available = e.base - e.reserved;
  return { ...e, available, missing: Math.max(0, e.min - available) };
}

/** Lo que falta, de más urgente (más unidades por pedidos) a menos. */
export function shortages(entries: StockEntry[]): StockLine[] {
  return entries.map(withMissing).filter((l) => l.missing > 0)
    .sort((a, b) => Number(b.reserved > b.base) - Number(a.reserved > a.base) || (a.oldestOrder ?? "9999").localeCompare(b.oldestOrder ?? "9999") || b.missing - a.missing);
}

/** Fecha límite de la tarea: según el pedido más antiguo que lo espera (+ margen), nunca antes de hoy. */
export function dueFor(l: Pick<StockLine, "oldestOrder" | "reserved" | "base">, today: string): string {
  if (!l.oldestOrder || l.reserved <= l.base) return addDays(today, MIN_ONLY_DAYS);
  const d = addDays(l.oldestOrder, DUE_MARGIN_DAYS);
  return d < today ? today : d;
}

export const taskTitle = (l: Pick<StockLine, "label" | "missing">) => `Reponer: ${l.label}, faltan ${l.missing}`.slice(0, 200);

export type OpenStockTask = { id: string; stock_key: string; stock_missing: number | null; title: string; due_date: string | null };
export type TaskPlan = {
  create: { key: string; title: string; missing: number; due: string }[];
  update: { id: string; title: string; missing: number; due: string }[];
  complete: { id: string; key: string }[];
};

/** Qué hacer con las tareas: una abierta por artículo; si cambia la cantidad se actualiza; si ya no falta, se completa. */
export function planTasks(lines: StockLine[], open: OpenStockTask[], today: string): TaskPlan {
  const plan: TaskPlan = { create: [], update: [], complete: [] };
  const byKey = new Map(lines.map((l) => [l.key, l]));
  const seen = new Set<string>();
  for (const t of open) {
    const l = byKey.get(t.stock_key);
    if (!l || seen.has(t.stock_key)) { plan.complete.push({ id: t.id, key: t.stock_key }); continue; }
    seen.add(t.stock_key);
    const title = taskTitle(l), due = dueFor(l, today);
    // La fecha solo se adelanta (si la cambias tú a más tarde, se respeta salvo que llegue un pedido más urgente).
    const newDue = t.due_date && t.due_date <= due ? t.due_date : due;
    if (t.stock_missing !== l.missing || t.title !== title || t.due_date !== newDue) plan.update.push({ id: t.id, title, missing: l.missing, due: newDue });
  }
  for (const l of lines) if (!seen.has(l.key)) plan.create.push({ key: l.key, title: taskTitle(l), missing: l.missing, due: dueFor(l, today) });
  return plan;
}

// ------------------------------------------------------------------ reservas de artículos genéricos
export type GenericItem = { id: string; name: string; variant: string; product_id: string | null; match_color: string | null; match_size: string | null };
export type PendingLine = { product_id: string | null; product_name: string; color: string | null; size: string | null; quantity: number; order_date: string };

const same = (a: string | null | undefined, b: string | null | undefined) => normalizeText(a ?? "") === normalizeText(b ?? "");

/** ¿Esta línea de pedido consume este artículo? Por producto del catálogo o por nombre; color/talla solo si el artículo los fija. */
export function lineMatches(item: GenericItem, line: PendingLine): boolean {
  const byProduct = item.product_id ? line.product_id === item.product_id : false;
  if (!byProduct && !same(item.name, line.product_name)) return false;
  if (item.match_color && !same(item.match_color, line.color)) return false;
  if (item.match_size && !same(item.match_size, line.size)) return false;
  return true;
}

export function reserveGeneric(item: GenericItem, lines: PendingLine[]): { reserved: number; oldestOrder: string | null } {
  let reserved = 0, oldest: string | null = null;
  for (const l of lines) if (lineMatches(item, l)) { reserved += l.quantity; if (!oldest || l.order_date < oldest) oldest = l.order_date; }
  return { reserved, oldestOrder: oldest };
}

export const itemLabel = (i: Pick<GenericItem, "name" | "variant">) => (i.variant ? `${i.name} ${i.variant}` : i.name);

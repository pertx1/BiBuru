/**
 * Stock que falta: lógica pura (probada en tests), válida en cliente y servidor. Mismo criterio que BATU (Antola) con Profity:
 * hay que pedir un artículo cuando lo disponible (lo que tienes − lo reservado por pedidos pendientes) está a 0 o por debajo,
 * o por debajo de su mínimo si le has puesto uno.
 */
import { normalizeText } from "@/lib/production/text";

export type StockGroup = "prendas" | "dtf" | "articulos";
export const GROUP_LABEL: Record<StockGroup, string> = { prendas: "Prendas", dtf: "DTF", articulos: "Materiales y productos" };

export type StockEntry = {
  key: string;            // tshirt|modelo|talla · dtf|diseño|variante · item|<id>
  group: StockGroup;
  label: string;          // «Camiseta negra M»
  base: number;           // lo que tienes
  min: number;
  reserved: number;       // lo que piden los pedidos pendientes
  oldestOrder: string | null;  // pedido pendiente más antiguo que lo necesita
};
/** `needed`: hay que pedirlo. `missing`: unidades para cubrir los pedidos y llegar al mínimo (0 = «se ha quedado a 0»). */
export type StockLine = StockEntry & { available: number; missing: number; needed: boolean };

export function withMissing(e: StockEntry): StockLine {
  const available = e.base - e.reserved;
  return { ...e, available, missing: Math.max(0, -available, e.min - available), needed: available <= 0 || available < e.min };
}

/** Lo que hay que pedir, de más urgente (más negativo) a menos. */
export function shortages(entries: StockEntry[]): StockLine[] {
  return entries.map(withMissing).filter((l) => l.needed)
    .sort((a, b) => a.available - b.available || (a.oldestOrder ?? "9999").localeCompare(b.oldestOrder ?? "9999") || a.label.localeCompare(b.label, "es"));
}

/** Título fijo (como en BATU): «Pedir Camiseta negra M». La cantidad va en las notas y se actualiza sola. */
export const taskTitle = (l: Pick<StockLine, "label">) => `Pedir ${l.label}`.slice(0, 200);

/** Nota de la tarea: cuánto falta (como `profityNotes` de BATU, con el mínimo si lo hay). */
export function taskNotes(l: Pick<StockLine, "available" | "missing" | "min">): string {
  const state = l.available < 0 ? `Faltan ${-l.available} para cubrir los pedidos pendientes.`
    : l.available === 0 ? "Se ha quedado a 0."
    : `Quedan ${l.available} y el mínimo es ${l.min}.`;
  const toMin = l.min > 0 && l.missing > Math.max(0, -l.available) ? ` Para llegar al mínimo (${l.min}) pide ${l.missing}.` : "";
  return `${state}${toMin}\nDesde Stock: la tarea se actualiza sola y se completa cuando hay stock.`;
}

export type StockTask = { id: string; stock_key: string; stock_missing: number | null; notes: string | null; status: string };
export type TaskPlan = {
  create: { key: string; title: string; notes: string; missing: number }[];
  update: { id: string; notes: string; missing: number }[];
  /** Ya hay stock: se suelta la clave y, si seguía pendiente, se completa sola. */
  release: { id: string; key: string; complete: boolean }[];
};

/**
 * Igual que `applyItems` de BATU: una tarea por artículo (clave `stock_key`).
 * - Falta y no hay tarea → se crea (para hoy, prioridad alta).
 * - Falta y la tarea está abierta → se actualiza la nota si cambió la cantidad.
 * - Falta y la tachaste → NO vuelve a salir mientras siga faltando.
 * - Ya hay stock → se suelta la clave; si estaba pendiente, se completa sola. Si vuelve a faltar, sale otra.
 */
export function planTasks(lines: StockLine[], tasks: StockTask[]): TaskPlan {
  const plan: TaskPlan = { create: [], update: [], release: [] };
  const wanted = new Map(lines.map((l) => [l.key, l]));
  const held = new Set<string>();
  for (const t of tasks) {
    const l = wanted.get(t.stock_key);
    if (!l || held.has(t.stock_key)) { plan.release.push({ id: t.id, key: t.stock_key, complete: t.status !== "done" && !l }); continue; }
    held.add(t.stock_key);
    if (t.status === "done") continue;
    const notes = taskNotes(l);
    if (notes !== t.notes || t.stock_missing !== l.missing) plan.update.push({ id: t.id, notes, missing: l.missing });
  }
  for (const l of lines) if (!held.has(l.key)) plan.create.push({ key: l.key, title: taskTitle(l), notes: taskNotes(l), missing: l.missing });
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

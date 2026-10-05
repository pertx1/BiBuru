/**
 * Convierte los datos de PROFITY (Prisma/Postgres) al modelo de BiBuru.
 * Lógica pura (sin red ni base de datos) para poder probarla a fondo.
 *
 * Reglas:
 *  - Importes: float en euros -> céntimos enteros.
 *  - Fechas: PROFITY guardaba "AAAA-MM-DD" como medianoche UTC. Si la hora no es
 *    medianoche exacta (pedidos con fecha por defecto = ahora), se usa el día en Europe/Madrid.
 *  - Pedido: `price` de PROFITY es el total del pedido. Si el total no se reparte en céntimos
 *    exactos entre las unidades, se guarda 1 línea de cantidad 1 con el total exacto (los totales
 *    mandan) y se avisa; la cantidad original queda en las notas.
 *  - Los apuntes de Vinted (categoría/fuente "Vinted") van a un negocio aparte si se indica.
 *  - Cada fila lleva `external_id` = "profity:<tabla>:<id>" para poder repetir la importación sin duplicar.
 */
import { todayISO } from "./dates";
import { toCents } from "./money";
import { colorKey } from "./production/text";

export type SrcExpense = { id: string; date: Date | string; category: string; concept: string | null; amount: number; paymentMethod: string | null };
export type SrcIncome = { id: string; date: Date | string; source: string; concept: string | null; amount: number; method: string | null };
export type SrcOrder = {
  id: string; orderNumber: string | null; date: Date | string; quantity: number; model: string;
  color: string | null; size: string | null; price: number; status: string;
};
export type SrcTshirtStock = { model: string; size: string; quantity: number };
export type SrcDtfStock = { name: string; variant: string; quantity: number };
export type SrcShirtRule = { shirtColor: string; dtfColor: string };
export type SrcDesignRule = { design: string; dtfColor: string };
export type SrcInvoice = { id: string; name: string; url: string };
export type Source = {
  expenses: SrcExpense[]; incomes: SrcIncome[]; orders: SrcOrder[];
  tshirtStocks?: SrcTshirtStock[]; dtfStocks?: SrcDtfStock[]; shirtRules?: SrcShirtRule[]; designRules?: SrcDesignRule[]; invoices?: SrcInvoice[];
};

/** Etiquetas de los modelos de prenda de PROFITY (enum TshirtModel). */
const MODEL_LABELS: Record<string, string> = { BLANCA: "Blanca", NEGRA: "Negra", FUTBOL: "Fútbol", SUDADERA_NEGRA: "Sudadera negra" };

export type PlanProduction = {
  tshirtStocks: { model: string; size: string; quantity: number }[];
  designs: { name: string; kind: "standalone" | "paired" }[];
  dtfStocks: { name: string; variant: "UNICO" | "BLANCO" | "NEGRO"; quantity: number }[];
  shirtRules: { shirt_color: string; shirt_color_key: string; dtf_color: string }[];
  designRules: { design: string; dtf_color: string }[];
  invoices: { external_id: string; name: string; url: string }[];
};

export type BizKey = "main" | "vinted";

export type PlanOrder = {
  external_id: string; biz: BizKey; order_date: string; order_number: string | null; status: string; notes: string | null;
  items: { product_name: string; color: string | null; size: string | null; quantity: number; unit_price_cents: number }[];
  total_cents: number;
};
export type PlanExpense = {
  external_id: string; biz: BizKey; expense_date: string; concept: string | null; category: string; amount_cents: number; payment_method: string | null;
};
export type PlanIncome = {
  external_id: string; biz: BizKey; income_date: string; source: string; concept: string | null; amount_cents: number; method: string | null;
};
export type Plan = {
  production: PlanProduction;
  orders: PlanOrder[]; expenses: PlanExpense[]; incomes: PlanIncome[];
  categories: string[];
  products: { name: string; price_cents: number }[];
  warnings: string[];
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export function toImportDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) throw new Error(`Fecha inválida: ${String(d)}`);
  const isMidnightUTC = date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0;
  return isMidnightUTC ? date.toISOString().slice(0, 10) : todayISO(date, "Europe/Madrid");
}

const STATUS = new Set(["sin_hacer", "en_casa", "en_paquete", "enviado", "sin_llegar", "cancelado"]);
const clean = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

export function buildPlan(src: Source, opts: { separateVinted: boolean }): Plan {
  const warnings: string[] = [];
  const bizOf = (label: string): BizKey => (opts.separateVinted && norm(label) === "vinted" ? "vinted" : "main");

  const categories = new Map<string, string>();
  const expenses: PlanExpense[] = [];
  for (const e of src.expenses) {
    const cents = toCents(e.amount);
    if (cents === null || cents <= 0) {
      warnings.push(`Gasto ${e.id} omitido: importe no válido (${e.amount}).`);
      continue;
    }
    const cat = e.category.trim() || "Otros";
    if (!categories.has(norm(cat))) categories.set(norm(cat), cat);
    expenses.push({
      external_id: `profity:expense:${e.id}`, biz: bizOf(cat), expense_date: toImportDate(e.date), concept: clean(e.concept),
      category: categories.get(norm(cat))!, amount_cents: cents, payment_method: clean(e.paymentMethod),
    });
  }

  const incomes: PlanIncome[] = [];
  for (const i of src.incomes) {
    const cents = toCents(i.amount);
    if (cents === null || cents <= 0) {
      warnings.push(`Ingreso ${i.id} omitido: importe no válido (${i.amount}).`);
      continue;
    }
    incomes.push({
      external_id: `profity:income:${i.id}`, biz: bizOf(i.source), income_date: toImportDate(i.date), source: i.source.trim() || "Otros",
      concept: clean(i.concept), amount_cents: cents, method: clean(i.method),
    });
  }

  const orders: PlanOrder[] = [];
  const latestPrice = new Map<string, { date: string; cents: number }>();
  let inexact = 0;
  for (const o of src.orders) {
    const total = toCents(o.price);
    if (total === null || total < 0) {
      warnings.push(`Pedido ${o.id} omitido: precio no válido (${o.price}).`);
      continue;
    }
    const qty = Math.max(1, Math.trunc(o.quantity || 1));
    const exact = total % qty === 0;
    if (!exact) inexact++;
    const status = o.status.toLowerCase();
    const date = toImportDate(o.date);
    const unit = exact ? total / qty : total;
    const name = o.model.trim() || "Sin nombre";
    orders.push({
      external_id: `profity:order:${o.id}`, biz: "main", order_date: date, order_number: clean(o.orderNumber),
      status: STATUS.has(status) ? status : "sin_hacer",
      notes: exact ? null : `Importado de PROFITY: cantidad original ${qty}, total ${(total / 100).toFixed(2).replace(".", ",")} €.`,
      items: [{ product_name: name, color: clean(o.color), size: clean(o.size), quantity: exact ? qty : 1, unit_price_cents: unit }],
      total_cents: total,
    });
    if (o.status.toUpperCase() !== "CANCELADO") {
      const prev = latestPrice.get(name);
      if (!prev || date >= prev.date) latestPrice.set(name, { date, cents: unit });
    }
  }
  if (inexact > 0) warnings.push(`${inexact} pedidos con total no divisible entre su cantidad: se importan como 1 línea de cantidad 1 con el total exacto.`);

  const production = buildProduction(src, warnings);
  return {
    production, orders, expenses, incomes, warnings,
    categories: [...categories.values()],
    products: [...latestPrice.entries()].map(([name, v]) => ({ name, price_cents: v.cents })),
  };
}

function buildProduction(src: Source, warnings: string[]): PlanProduction {
  const tshirtStocks = (src.tshirtStocks ?? []).map((t) => ({
    model: MODEL_LABELS[t.model] ?? t.model.charAt(0) + t.model.slice(1).toLowerCase().replace(/_/g, " "), size: t.size.trim().toUpperCase(), quantity: Math.trunc(t.quantity),
  }));
  const dtfStocks = (src.dtfStocks ?? []).flatMap((d) => {
    const variant = d.variant.toUpperCase();
    if (variant !== "UNICO" && variant !== "BLANCO" && variant !== "NEGRO") { warnings.push(`DTF «${d.name}» con variante desconocida (${d.variant}): omitido.`); return []; }
    return [{ name: d.name.trim(), variant: variant as "UNICO" | "BLANCO" | "NEGRO", quantity: Math.trunc(d.quantity) }];
  });
  // Un diseño es "único" si solo tiene variante UNICO en PROFITY; si tiene blanco/negro, emparejado.
  const kinds = new Map<string, "standalone" | "paired">();
  for (const d of dtfStocks) if (d.variant !== "UNICO") kinds.set(d.name, "paired");
  for (const d of dtfStocks) if (!kinds.has(d.name)) kinds.set(d.name, "standalone");
  const designs = [...kinds.entries()].map(([name, kind]) => ({ name, kind }));
  const invoices = (src.invoices ?? []).flatMap((i) => {
    if (!/^https?:\/\//i.test(i.url)) { warnings.push(`Factura «${i.name}» omitida: el enlace no es http(s).`); return []; }
    return [{ external_id: `profity:invoice:${i.id}`, name: i.name.trim().slice(0, 80), url: i.url.trim() }];
  });
  return {
    tshirtStocks, designs, dtfStocks, invoices,
    shirtRules: (src.shirtRules ?? []).map((r) => ({ shirt_color: r.shirtColor.trim(), shirt_color_key: colorKey(r.shirtColor), dtf_color: r.dtfColor.trim() })),
    designRules: (src.designRules ?? []).map((r) => ({ design: r.design.trim(), dtf_color: r.dtfColor.trim() })),
  };
}

/** Totales esperados (en céntimos) para comparar con lo que acabe en la base de datos. */
export function expectedTotals(plan: Plan) {
  const sum = (xs: { v: number }[]) => xs.reduce((s, x) => s + x.v, 0);
  const activeOrders = plan.orders.filter((o) => o.status !== "cancelado");
  return {
    orders: { count: plan.orders.length, totalCents: sum(plan.orders.map((o) => ({ v: o.total_cents }))) },
    ordersActive: { count: activeOrders.length, totalCents: sum(activeOrders.map((o) => ({ v: o.total_cents }))) },
    expenses: { count: plan.expenses.length, totalCents: sum(plan.expenses.map((e) => ({ v: e.amount_cents }))) },
    incomes: { count: plan.incomes.length, totalCents: sum(plan.incomes.map((i) => ({ v: i.amount_cents }))) },
    // Producción: "totalCents" aquí son unidades de stock (no dinero).
    tshirtStocks: { count: plan.production.tshirtStocks.length, totalCents: plan.production.tshirtStocks.reduce((s, t) => s + t.quantity, 0) },
    dtfStocks: { count: plan.production.dtfStocks.length, totalCents: plan.production.dtfStocks.reduce((s, t) => s + t.quantity, 0) },
    invoices: { count: plan.production.invoices.length, totalCents: 0 },
  };
}

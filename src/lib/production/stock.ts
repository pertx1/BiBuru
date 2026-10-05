import { resolveDesign, resolveDtfColor, resolveShirtModel, resolveSize, type Catalog, type DtfVariant, type Rules } from "./catalog";
import { capitalize, colorKey, garmentName, normalizeText, shirtColorLabel, sizeRank } from "./text";

export type PendingItem = { product_name: string; color: string | null; size: string | null; quantity: number };
export type StockEffect = {
  tshirt?: { model: string; size: string };
  dtf?: { name: string; variant: DtfVariant };
};

/**
 * Qué hay que descontar del stock por una línea de pedido: una prenda de un
 * modelo y talla y, si el "producto" es un diseño DTF, el DTF correspondiente
 * (blanco/negro según la prenda, o único si el diseño no depende del color).
 */
export function resolveStockEffect(item: Pick<PendingItem, "product_name" | "color" | "size">, catalog: Catalog, rules: Rules): StockEffect {
  const effect: StockEffect = {};
  const size = resolveSize(item.size);
  const design = resolveDesign(item.product_name, catalog);

  if (design) {
    const model = resolveShirtModel(item.color, catalog);
    if (model && size) effect.tshirt = { model, size };
    if (design.kind === "standalone") {
      effect.dtf = { name: design.name, variant: "UNICO" };
    } else if (model) {
      const dtf = resolveDtfColor(design, model, rules);
      const variant = dtf.color ? variantOf(dtf.color) : null;
      if (variant) effect.dtf = { name: design.name, variant };
    }
    return effect;
  }

  const model = resolveShirtModel(item.product_name, catalog) ?? resolveShirtModel(item.color, catalog);
  if (model && size) effect.tshirt = { model, size };
  return effect;
}

function variantOf(dtfColor: string): DtfVariant | null {
  const n = normalizeText(dtfColor);
  if (n === "blanco" || n === "blanca") return "BLANCO";
  if (n === "negro" || n === "negra") return "NEGRO";
  return null;
}

export type StockRows = {
  tshirts: { model: string; size: string; quantity: number }[];
  dtfs: { name: string; variant: DtfVariant; quantity: number }[];
};

export type NeedsOrderItem = { key: string; label: string; quantity: number };

const DTF_VARIANT_LABELS: Record<DtfVariant, string> = {
  UNICO: "",
  BLANCO: "DTF blanco · para camiseta o sudadera negra",
  NEGRO: "DTF negro · para camiseta blanca",
};

/** Prenda para mostrar: "Camiseta blanca", "Sudadera negra". */
export function garmentLabel(model: string): string {
  return capitalize(garmentName(shirtColorLabel(model)));
}

/**
 * Stock real = lo que tienes (base) − lo que piden los pedidos pendientes.
 * Puede ser negativo. «Pedir ya» = todo lo que está a 0 o menos (como en PROFITY).
 */
export function computeStockOverview(rows: StockRows, pending: PendingItem[], catalog: Catalog, rules: Rules) {
  const tDemand = new Map<string, number>();
  const dDemand = new Map<string, number>();
  for (const item of pending) {
    const e = resolveStockEffect(item, catalog, rules);
    if (e.tshirt) tDemand.set(`${e.tshirt.model}|${e.tshirt.size}`, (tDemand.get(`${e.tshirt.model}|${e.tshirt.size}`) ?? 0) + item.quantity);
    if (e.dtf) dDemand.set(`${e.dtf.name}|${e.dtf.variant}`, (dDemand.get(`${e.dtf.name}|${e.dtf.variant}`) ?? 0) + item.quantity);
  }

  const modelOrder = (m: string) => {
    const i = catalog.models.indexOf(m);
    return i === -1 ? catalog.models.length : i;
  };
  const tshirts = rows.tshirts
    .map((r) => ({ ...r, base: r.quantity, quantity: r.quantity - (tDemand.get(`${r.model}|${r.size}`) ?? 0) }))
    .sort((a, b) => modelOrder(a.model) - modelOrder(b.model) || sizeRank(a.size) - sizeRank(b.size));

  // Solo filas que siguen en el catálogo (un diseño puede pasar de emparejado a único).
  const kindOf = new Map(catalog.designs.map((d) => [d.name, d.kind]));
  const inCatalog = (r: { name: string; variant: DtfVariant }) =>
    kindOf.has(r.name) && (kindOf.get(r.name) === "standalone" ? r.variant === "UNICO" : r.variant !== "UNICO");
  const dtfs = rows.dtfs
    .filter(inCatalog)
    .map((r) => ({ ...r, base: r.quantity, quantity: r.quantity - (dDemand.get(`${r.name}|${r.variant}`) ?? 0) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es") || a.variant.localeCompare(b.variant));

  const needsOrder: NeedsOrderItem[] = [
    ...tshirts.filter((s) => s.quantity <= 0).map((s) => ({ key: `tshirt-${s.model}-${s.size}`, label: `${garmentLabel(s.model)} · talla ${s.size}`, quantity: s.quantity })),
    ...dtfs.filter((s) => s.quantity <= 0).map((s) => ({
      key: `dtf-${s.name}-${s.variant}`,
      label: s.variant === "UNICO" ? `DTF ${s.name}` : `${s.name} · ${DTF_VARIANT_LABELS[s.variant]}`,
      quantity: s.quantity,
    })),
  ].sort((a, b) => a.quantity - b.quantity);

  return {
    tshirts, dtfs, needsOrder,
    tshirtTotal: tshirts.reduce((s, r) => s + r.quantity, 0),
    dtfTotal: dtfs.reduce((s, r) => s + r.quantity, 0),
  };
}

/** Filas de stock que deben existir para un diseño (según su tipo). */
export function dtfVariantsFor(kind: "standalone" | "paired"): DtfVariant[] {
  return kind === "standalone" ? ["UNICO"] : ["BLANCO", "NEGRO"];
}

export { colorKey };

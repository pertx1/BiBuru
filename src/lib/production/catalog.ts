import { colorKey, dtfColorLabel, normalizeText, SIZES } from "./text";

export type DesignKind = "standalone" | "paired";
export type DtfVariant = "UNICO" | "BLANCO" | "NEGRO";

export type Catalog = {
  /** Modelos de prenda tal y como se muestran ("Blanca", "Negra", "Fútbol", "Sudadera negra"). */
  models: string[];
  /** `garment`: prenda fija del diseño (resta esa prenda siempre, p. ej. «Sudadera negra»). */
  designs: { name: string; kind: DesignKind; garment?: string | null }[];
};

export type Rules = {
  shirt: { shirtColorKey: string; dtfColor: string }[];
  design: { design: string; dtfColor: string }[];
};

const ALIASES: Record<string, string> = { white: "blanca", black: "negra" };

/**
 * Reconoce el modelo de prenda a partir de lo escrito en un pedido ("Blanco",
 * "negra", "Fútbol", "Sudadera negra", "white"…). null si no encaja con el catálogo.
 */
export function resolveShirtModel(value: string | null | undefined, catalog: Catalog): string | null {
  if (!value || !value.trim()) return null;
  const n = normalizeText(value);
  if (n.includes("sudadera")) {
    return catalog.models.find((m) => normalizeText(m).includes("sudadera")) ?? null;
  }
  const key = colorKey(ALIASES[n] ?? n);
  const exact = catalog.models.find((m) => colorKey(m) === key);
  if (exact) return exact;
  // "Camiseta de fútbol" -> modelo "Fútbol": el texto contiene el nombre del modelo.
  return catalog.models.find((m) => colorKey(m).length >= 5 && n.includes(normalizeText(m))) ?? null;
}

export function resolveSize(value: string | null | undefined): string | null {
  if (!value) return null;
  const n = normalizeText(value).toUpperCase();
  return (SIZES as readonly string[]).includes(n) ? n : null;
}

const GARMENT_WORDS = new Set(["camiseta", "camisetas", "sudadera", "sudaderas", "dtf", "de", "con", "la", "el"]);
const tokens = (v: string) => normalizeText(v).replace(/[^a-z0-9ñ ]+/g, " ").split(" ").filter(Boolean);

/**
 * Diseño de un pedido a partir de lo escrito. Primero el nombre exacto; si no, el diseño cuyas palabras aparecen
 * todas en el producto («Camiseta Flysch negra» → Flysch; «Sudadera Gatazka» → Gatazka Sudadera). Si hay versiones
 * por prenda («Gatazka Camiseta» / «Gatazka Sudadera»), elige la de la prenda del pedido (`garment`, o camiseta).
 */
export function resolveDesign(value: string | null | undefined, catalog: Catalog, garment?: string | null): Catalog["designs"][number] | null {
  if (!value) return null;
  const n = normalizeText(value);
  const exact = catalog.designs.find((d) => normalizeText(d.name) === n);
  if (exact) return exact;
  const have = new Set(tokens(`${value} ${garment ?? ""}`));
  const wantSudadera = have.has("sudadera") || have.has("sudaderas");
  let best: { d: Catalog["designs"][number]; score: number } | null = null;
  for (const d of catalog.designs) {
    const all = tokens(d.name);
    const core = all.filter((t) => !GARMENT_WORDS.has(t));
    if (!core.length || !core.every((t) => have.has(t))) continue;
    const garmentWords = all.filter((t) => t === "camiseta" || t === "sudadera");
    // Encaja la prenda del diseño (si la dice) con la del pedido.
    const garmentOk = garmentWords.length === 0 || garmentWords.includes(wantSudadera ? "sudadera" : "camiseta");
    const score = core.length * 10 + (garmentWords.length ? (garmentOk ? 5 : -100) : 0);
    if (score > 0 && (!best || score > best.score)) best = { d, score };
  }
  return best?.d ?? null;
}

const DEFAULT_DTF_BY_SHIRT: Record<string, string> = {
  [colorKey("sudadera negra")]: "blanco",
  [colorKey("sudadera")]: "blanco",
  [colorKey("blanca")]: "negro",
  [colorKey("white")]: "negro",
  [colorKey("negra")]: "blanco",
  [colorKey("black")]: "blanco",
};

/**
 * Color del DTF para un diseño sobre una prenda. Prioridad: DTF especial del
 * diseño → regla por color de prenda → blanco↔negro por defecto. Los diseños
 * "únicos" no dependen del color de la prenda.
 */
export function resolveDtfColor(
  design: { name: string; kind: DesignKind },
  shirtColor: string | null,
  rules: Rules,
): { color: string | null; unique?: boolean } {
  const designRule = rules.design.find((r) => normalizeText(r.design) === normalizeText(design.name));
  if (designRule) return { color: dtfColorLabel(designRule.dtfColor) };
  if (design.kind === "standalone") return { color: null, unique: true };
  if (!shirtColor) return { color: null };
  const key = colorKey(shirtColor);
  const shirtRule = rules.shirt.find((r) => r.shirtColorKey === key);
  if (shirtRule) return { color: dtfColorLabel(shirtRule.dtfColor) };
  return { color: DEFAULT_DTF_BY_SHIRT[key] ?? null };
}

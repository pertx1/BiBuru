import { colorKey, dtfColorLabel, normalizeText, SIZES } from "./text";

export type DesignKind = "standalone" | "paired";
export type DtfVariant = "UNICO" | "BLANCO" | "NEGRO";

export type Catalog = {
  /** Modelos de prenda tal y como se muestran ("Blanca", "Negra", "Fútbol", "Sudadera negra"). */
  models: string[];
  designs: { name: string; kind: DesignKind }[];
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

export function resolveDesign(value: string | null | undefined, catalog: Catalog): { name: string; kind: DesignKind } | null {
  if (!value) return null;
  const n = normalizeText(value);
  return catalog.designs.find((d) => normalizeText(d.name) === n) ?? null;
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

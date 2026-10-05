/** Utilidades de texto para casar nombres escritos a mano (colores, diseños, tallas). */

export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * "Blanca"/"Blanco", "Roja"/"Rojo"… son el mismo color: se agrupan quitando la
 * -a/-o final de cada palabra de más de 3 letras.
 */
export function colorKey(value: string): string {
  return normalizeText(value)
    .split(" ")
    .map((w) => (w.length > 3 && /[ao]$/.test(w) ? w.slice(0, -1) : w))
    .join(" ");
}

const FEMININE: Record<string, string> = {
  blanco: "blanca", negro: "negra", rojo: "roja", amarillo: "amarilla", morado: "morada",
};
const MASCULINE: Record<string, string> = Object.fromEntries(Object.entries(FEMININE).map(([m, f]) => [f, m]));

const words = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase().split(" ");

/** "Blanco" → "blanca" (para que lea bien detrás de "Camiseta"). */
export function shirtColorLabel(value: string): string {
  return words(value).map((w) => FEMININE[normalizeText(w)] ?? w).join(" ");
}

/** "Negra" → "negro" (para que lea bien detrás de "DTF …"). */
export function dtfColorLabel(value: string): string {
  return words(value).map((w) => MASCULINE[normalizeText(w)] ?? w).join(" ");
}

/** "blanca" → "camiseta blanca"; "sudadera negra" → "sudadera negra". */
export function garmentName(colorLabel: string): string {
  return colorLabel.startsWith("sudadera") ? colorLabel : `camiseta ${colorLabel}`;
}

export const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export const SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
/** Tallas con las que se crea un modelo nuevo (como en PROFITY). */
export const DEFAULT_SIZES = ["S", "M", "L", "XL", "XXL"] as const;

export function sizeRank(size: string): number {
  const i = (SIZES as readonly string[]).indexOf(size.toUpperCase());
  return i === -1 ? SIZES.length : i;
}

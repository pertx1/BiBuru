/** Todo el dinero se maneja en céntimos enteros; solo se formatea al mostrarlo. */

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const eurPlain = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1234 -> "12,34 €" */
export function formatEUR(cents: number): string {
  return eur.format(cents / 100);
}

/** 1234 -> "12,34" (para CSV y campos de edición) */
export function formatDecimal(cents: number): string {
  return eurPlain.format(cents / 100).replace(/\./g, "");
}

/**
 * Convierte texto o número a céntimos. Acepta "12,5", "12.50", "1.234,56",
 * "1,234.56", "€ 12" y negativos. Devuelve null si no es un importe válido.
 */
export function toCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(Number((input * 100).toPrecision(15))) : null;
  }
  let s = input.replace(/[€\s ]/g, "");
  if (s === "" || !/^-?[\d.,]+$/.test(s)) return null;
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const decimalSep = lastComma > lastDot ? "," : lastDot > lastComma ? "." : null;
  let intPart = s;
  let frac = "";
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    const after = s.slice(idx + 1);
    // En español la coma es decimal. Un único punto seguido de exactamente 3
    // dígitos ("1.234") es de miles, salvo que empiece por 0 ("0.005").
    const head = s.slice(0, idx);
    const isThousands =
      decimalSep === "." && after.length === 3 && !s.includes(",") && s.split(".").length === 2 &&
      /^[1-9]\d{0,2}$/.test(head);
    if (!isThousands) {
      intPart = s.slice(0, idx);
      frac = after;
    }
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac) || (intPart === "" && frac === "")) return null;
  const cents = Number(intPart || "0") * 100 + Math.round(Number((frac + "00").slice(0, 2)) + (frac.length > 2 ? Number("0." + frac.slice(2)) : 0));
  return neg ? -cents : cents;
}

export type LineItem = { quantity: number; unitPriceCents: number; unitCostCents?: number };

export function lineTotal(l: LineItem): number {
  return l.quantity * l.unitPriceCents;
}

export function orderTotals(lines: LineItem[]) {
  const total = lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
  const cost = lines.reduce((s, l) => s + l.quantity * (l.unitCostCents ?? 0), 0);
  return { totalCents: total, costCents: cost, profitCents: total - cost };
}

/** Margen en % (0–100, un decimal) o null si no hay ingresos. */
export function marginPct(profitCents: number, incomeCents: number): number | null {
  if (incomeCents <= 0) return null;
  return Math.round((profitCents / incomeCents) * 1000) / 10;
}

/**
 * Variación porcentual entre dos periodos (un decimal). null si no hay base
 * (periodo anterior a 0): no se inventa un "infinito".
 */
export function variationPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/** Reparte un total en N partes sin perder céntimos (el resto va a las primeras). */
export function splitCents(total: number, parts: number): number[] {
  const base = Math.trunc(total / parts);
  const rest = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < Math.abs(rest) ? Math.sign(rest) : 0));
}

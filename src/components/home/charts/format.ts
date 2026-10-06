const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «6 oct» (días) o «oct 26» (meses) a partir de una fecha ISO. */
export function pointLabel(iso: string | null, granularity: "day" | "month"): string {
  if (!iso) return "";
  const m = MONTHS[+iso.slice(5, 7) - 1];
  return granularity === "day" ? `${+iso.slice(8, 10)} ${m}` : `${m} ${iso.slice(2, 4)}`;
}

export const eur = (cents: number) => (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

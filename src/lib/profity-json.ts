import { z } from "zod";
import type { Source } from "./profity-import";

/**
 * Lee la exportación JSON de PROFITY («profity-AAAA-MM-DD.json») y la convierte al mismo formato que usa el
 * importador desde la base de datos. Valida cada fila: si algo no encaja, dice qué y dónde.
 */
const num = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)]);
const str = z.string();
const opt = z.string().nullish().transform((v) => v ?? null);

const fileSchema = z.object({
  exportadoEl: str.optional(),
  usuario: z.object({ email: str.optional() }).partial().optional(),
  pedidos: z.array(z.object({ id: str, orderNumber: z.union([str, z.number()]).nullish(), date: str, quantity: num, model: str, color: opt, size: opt, price: num, status: str })).default([]),
  gastos: z.array(z.object({ id: str, date: str, category: str, concept: opt, amount: num, paymentMethod: opt })).default([]),
  ingresos: z.array(z.object({ id: str, date: str, source: str, concept: opt, amount: num, method: opt })).default([]),
  facturas: z.array(z.object({ id: str, name: str, url: str })).default([]),
  stock: z.object({
    camisetas: z.array(z.object({ modelo: str, talla: str, base: num })).default([]),
    dtf: z.array(z.object({ diseno: str, variante: str, base: num })).default([]),
  }).partial().default({}),
  ajustes: z.object({
    reglasColorCamiseta: z.array(z.object({ shirtColor: str, dtfColor: str })).default([]),
    reglasDiseno: z.array(z.object({ design: str, dtfColor: str })).default([]),
  }).partial().default({}),
});

export type ProfityJson = { source: Source; email: string | null; exportedAt: string | null };

export function parseProfityJson(text: string): { ok: true; data: ProfityJson } | { ok: false; error: string } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: "El archivo no es un JSON válido." }; }
  if (!raw || typeof raw !== "object" || !("pedidos" in raw || "gastos" in raw)) return { ok: false, error: "No parece una exportación de PROFITY (faltan «pedidos» y «gastos»)." };
  const p = fileSchema.safeParse(raw);
  if (!p.success) {
    const i = p.error.issues[0];
    return { ok: false, error: `Dato no válido en ${i.path.join(" → ")}: ${i.message}` };
  }
  const d = p.data;
  return {
    ok: true,
    data: {
      email: d.usuario?.email ?? null,
      exportedAt: d.exportadoEl ?? null,
      source: {
        orders: d.pedidos.map((o) => ({ ...o, orderNumber: o.orderNumber == null ? null : String(o.orderNumber) })),
        expenses: d.gastos,
        incomes: d.ingresos,
        invoices: d.facturas,
        // En PROFITY el stock guardado es la «base»; lo «actual» se calcula restando pedidos pendientes (igual que en BiBuru).
        tshirtStocks: (d.stock.camisetas ?? []).map((t) => ({ model: t.modelo, size: t.talla, quantity: t.base })),
        dtfStocks: (d.stock.dtf ?? []).map((t) => ({ name: t.diseno, variant: t.variante, quantity: t.base })),
        shirtRules: d.ajustes.reglasColorCamiseta ?? [],
        designRules: d.ajustes.reglasDiseno ?? [],
      },
    },
  };
}

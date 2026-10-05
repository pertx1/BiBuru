import { z } from "zod";
import { isValidISO } from "@/lib/dates";
import { toCents } from "@/lib/money";

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optText = (max: number) => z.preprocess(emptyToUndef, z.string().trim().max(max).optional());

export const isoDate = z.string().refine(isValidISO, "Fecha inválida");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido");

/** Importe positivo en euros escrito por una persona ("12,50") -> céntimos. */
export const positiveMoney = z.string().transform((s, ctx) => {
  const c = toCents(s);
  if (c === null || c <= 0) {
    ctx.addIssue({ code: "custom", message: "Importe no válido (debe ser mayor que 0)" });
    return z.NEVER;
  }
  if (c > 100_000_000) {
    ctx.addIssue({ code: "custom", message: "Importe demasiado grande" });
    return z.NEVER;
  }
  return c;
});
export const nonNegativeMoney = z.preprocess(emptyToUndef, z.string().optional()).transform((s, ctx) => {
  if (s === undefined) return 0;
  const c = toCents(s);
  if (c === null || c < 0 || c > 100_000_000) {
    ctx.addIssue({ code: "custom", message: "Importe no válido" });
    return z.NEVER;
  }
  return c;
});

export const ORDER_STATUSES = ["sin_hacer", "en_casa", "en_paquete", "enviado", "sin_llegar", "cancelado"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  sin_hacer: "Sin hacer", en_casa: "En casa", en_paquete: "En paquete",
  enviado: "Enviado", sin_llegar: "Sin llegar", cancelado: "Cancelado",
};
export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  sin_hacer: "#64748b", en_casa: "#0f766e", en_paquete: "#d97706",
  enviado: "#16a34a", sin_llegar: "#ea580c", cancelado: "#dc2626",
};

export const BUSINESS_ICONS = ["briefcase", "shirt", "shopping-bag", "store", "palette", "camera", "code", "utensils", "dumbbell", "music", "home", "sparkles"] as const;
export const BUSINESS_COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#475569"];

export const businessSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Pon un nombre").max(60),
  description: optText(500),
  color: hexColor,
  icon: z.enum(BUSINESS_ICONS),
});

export const orderItemSchema = z.object({
  product_id: z.uuid().nullish(),
  product_name: z.string().trim().min(1, "Cada línea necesita un producto").max(80),
  color: optText(40),
  size: optText(20),
  quantity: z.coerce.number().int("La cantidad debe ser un número entero").min(1).max(10_000),
  unit_price: nonNegativeMoney,
  unit_cost: nonNegativeMoney,
});

export const orderSchema = z.object({
  id: z.uuid().optional(),
  business_id: z.uuid(),
  order_date: isoDate,
  order_number: optText(40),
  customer: optText(120),
  channel: optText(60),
  status: z.enum(ORDER_STATUSES),
  notes: optText(2000),
  items: z.array(orderItemSchema).min(1, "Añade al menos una línea").max(100),
});

export const expenseSchema = z.object({
  id: z.uuid().optional(),
  business_id: z.uuid(),
  expense_date: isoDate,
  concept: optText(120),
  category_id: z.preprocess(emptyToUndef, z.uuid().optional()),
  amount: positiveMoney,
  supplier: optText(120),
  payment_method: optText(40),
  recurrence: z.preprocess(emptyToUndef, z.enum(["weekly", "monthly", "yearly"]).optional()),
  recurrence_end: z.preprocess(emptyToUndef, isoDate.optional()),
  attachment_path: z.preprocess(emptyToUndef, z.string().max(300).optional()),
});

export const incomeSchema = z.object({
  id: z.uuid().optional(),
  business_id: z.uuid(),
  income_date: isoDate,
  source: z.string().trim().min(1, "Indica la fuente").max(60),
  concept: optText(120),
  amount: positiveMoney,
  method: optText(40),
});

export const productSchema = z.object({
  id: z.uuid().optional(),
  business_id: z.uuid(),
  name: z.string().trim().min(1, "Pon un nombre").max(80),
  price: nonNegativeMoney,
  cost: nonNegativeMoney,
});

export const categorySchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Pon un nombre").max(60),
  color: hexColor,
});

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

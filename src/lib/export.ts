import { toCsv } from "@/lib/csv";
import { formatDecimal } from "@/lib/money";

/** Tablas que se exportan (todo lo tuyo salvo credenciales y claves de avisos). */
export const EXPORT_TABLES = [
  "businesses", "products", "orders", "order_items", "expenses", "expense_categories", "incomes", "invoices",
  "tshirt_stocks", "dtf_stocks", "dtf_designs", "shirt_dtf_rules", "design_dtf_rules", "print_bag_checks",
  "tasks", "events", "goals", "goal_milestones", "goal_progress", "reminders",
  "notes", "folders", "tags", "taggings", "inbox_items", "saved_videos", "video_categories", "chat_messages", "ai_usage", "ai_prices",
] as const;
export type ExportTable = (typeof EXPORT_TABLES)[number];

/** Conjuntos para CSV (Excel): una hoja por tema. */
export const CSV_DATASETS: Record<string, { label: string; table: ExportTable }> = {
  pedidos: { label: "Pedidos", table: "orders" },
  lineas: { label: "Líneas de pedido", table: "order_items" },
  gastos: { label: "Gastos", table: "expenses" },
  ingresos: { label: "Ingresos", table: "incomes" },
  tareas: { label: "Tareas", table: "tasks" },
  notas: { label: "Notas", table: "notes" },
  videos: { label: "Vídeos guardados", table: "saved_videos" },
};

const HIDDEN = new Set(["workspace_id", "user_id", "fts"]);

/** Filas → CSV: céntimos a euros con coma (`*_cents` → `*_eur`), objetos como JSON y sin columnas internas. */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => !HIDDEN.has(c));
  const header = cols.map((c) => (c.endsWith("_cents") ? c.replace(/_cents$/, "_eur") : c));
  const body = rows.map((r) => cols.map((c) => {
    const v = r[c];
    if (v === null || v === undefined) return "";
    if (c.endsWith("_cents") && typeof v === "number") return formatDecimal(v);
    if (typeof v === "object") return JSON.stringify(v);
    return typeof v === "number" ? String(v).replace(".", ",") : String(v);
  }));
  return toCsv(header, body);
}

import { StockScreen } from "@/components/stock/stock-screen";
import { getContext } from "@/lib/context";
import { listProducts } from "@/lib/data";
import { loadInventory, syncStockTasks } from "@/lib/stock/service";

export const metadata = { title: "Stock" };

export default async function StockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Las tareas «Reponer» se ponen al día al abrir (por si algo cambió sin pasar por la app, p. ej. un pedido importado).
  const synced = await syncStockTasks(id);
  const { supabase, workspaceId } = await getContext();
  const [inv, products, moves, tasks] = await Promise.all([
    loadInventory(id).catch(() => null),
    listProducts(id),
    supabase.from("stock_movements").select("id, label, kind, delta, reason, moved_on").eq("workspace_id", workspaceId).eq("business_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("tasks").select("id, stock_key").eq("workspace_id", workspaceId).eq("business_id", id).eq("status", "open").not("stock_key", "is", null),
  ]);
  if (!inv || synced === null && moves.error) {
    return <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">El stock aún no está disponible: falta aplicar la actualización de la base de datos (se aplica sola al publicar en producción).</p>;
  }
  return (
    <StockScreen
      businessId={id} lines={inv.lines} items={inv.items} production={inv.production}
      products={products.map((p) => ({ id: p.id, name: p.name }))}
      moves={moves.data ?? []}
      taskByKey={Object.fromEntries((tasks.data ?? []).map((t) => [t.stock_key!, t.id]))}
    />
  );
}

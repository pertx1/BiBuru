import { ProductsView } from "@/components/businesses/simple-lists";
import { listProducts } from "@/lib/data";

export const metadata = { title: "Productos" };

export default async function ProductosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductsView businessId={id} products={await listProducts(id)} />;
}

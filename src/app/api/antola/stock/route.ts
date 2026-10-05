import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Catalog, DtfVariant } from "@/lib/production/catalog";
import { computeStockOverview } from "@/lib/production/stock";
import { getPublicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

type Snapshot = {
  designs: { name: string; kind: "standalone" | "paired" }[];
  tshirt_stocks: { model: string; size: string; quantity: number }[];
  dtf_stocks: { name: string; variant: DtfVariant; quantity: number }[];
  shirt_rules: { shirt_color_key: string; dtf_color: string }[];
  design_rules: { design: string; dtf_color: string }[];
  pending_items: { product_name: string; color: string | null; size: string | null; quantity: number }[];
};

/**
 * Integración con Antola: devuelve lo que hay que pedir (stock a 0 o menos) del negocio dueño
 * de la clave. Va en «Authorization: Bearer pf_…». Solo se compara el hash de la clave; la
 * base de datos solo devuelve datos si el hash existe (función `antola_snapshot`).
 */
export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (token.length < 20 || token.length > 200) return NextResponse.json({ error: "Clave incorrecta" }, { status: 401 });

  const env = getPublicEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("antola_snapshot", { p_hash: createHash("sha256").update(token).digest("hex") });
  if (error) return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Clave incorrecta" }, { status: 401 });

  const s = data as unknown as Snapshot;
  const models: string[] = [];
  for (const t of s.tshirt_stocks) if (!models.includes(t.model)) models.push(t.model);
  const catalog: Catalog = { models, designs: s.designs };
  const overview = computeStockOverview(
    { tshirts: s.tshirt_stocks, dtfs: s.dtf_stocks },
    s.pending_items, catalog,
    { shirt: s.shirt_rules.map((r) => ({ shirtColorKey: r.shirt_color_key, dtfColor: r.dtf_color })), design: s.design_rules.map((r) => ({ design: r.design, dtfColor: r.dtf_color })) },
  );
  return NextResponse.json({ items: overview.needsOrder }, { headers: { "Cache-Control": "no-store" } });
}

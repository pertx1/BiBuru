import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { expensesToCsv, ordersToCsv, type ExpenseRow, type OrderRow } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";

/** Exporta pedidos o gastos de un negocio a CSV. La RLS limita a los datos del usuario. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const business = z.uuid().safeParse(request.nextUrl.searchParams.get("negocio"));
  if (!business.success || (kind !== "pedidos" && kind !== "gastos")) {
    return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let csv: string;
  if (kind === "pedidos") {
    const { data, error } = await supabase.from("orders").select("*, order_items(*)").eq("business_id", business.data).order("order_date", { ascending: false }).limit(50_000);
    if (error) return NextResponse.json({ error: "No se pudo exportar" }, { status: 500 });
    csv = ordersToCsv(data as OrderRow[]);
  } else {
    const { data, error } = await supabase.from("expenses").select("*, expense_categories(name)").eq("business_id", business.data).order("expense_date", { ascending: false }).limit(50_000);
    if (error) return NextResponse.json({ error: "No se pudo exportar" }, { status: 500 });
    csv = expensesToCsv(data as ExpenseRow[]);
  }
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

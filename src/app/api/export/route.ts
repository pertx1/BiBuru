import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/context";
import { CSV_DATASETS, EXPORT_TABLES, rowsToCsv, type ExportTable } from "@/lib/export";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function fetchAll(supabase: Awaited<ReturnType<typeof getContext>>["supabase"], table: ExportTable, workspaceId: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as Record<string, unknown>[]));
    if (data.length < 1000) break;
  }
  return rows;
}

/** Exportación de TUS datos (sesión + RLS): `?formato=json` (todo) o `?formato=csv&conjunto=gastos`. */
export async function GET(request: NextRequest) {
  const { supabase, workspaceId } = await getContext();
  const p = request.nextUrl.searchParams;
  const stamp = new Date().toISOString().slice(0, 10);
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    if (p.get("formato") === "csv") {
      const set = CSV_DATASETS[p.get("conjunto") ?? ""];
      if (!set) return NextResponse.json({ error: "Conjunto no válido" }, { status: 400 });
      const csv = rowsToCsv(await fetchAll(supabase, set.table, workspaceId));
      return new NextResponse(csv, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="biburu-${p.get("conjunto")}-${stamp}.csv"` } });
    }
    const data: Record<string, unknown> = {};
    for (const t of EXPORT_TABLES) data[t] = await fetchAll(supabase, t, workspaceId);
    const { data: profile } = await supabase.from("profiles").select("display_name, timezone, ai_monthly_budget_cents").maybeSingle();
    const body = JSON.stringify({ app: "BiBuru", exported_at: new Date().toISOString(), note: "Los tickets (fotos/PDF) están en el almacenamiento de Supabase; aquí constan sus rutas.", profile, data }, null, 2);
    return new NextResponse(body, { headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="biburu-${stamp}.json"` } });
  } catch (e) {
    console.error("[export]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo exportar" }, { status: 500 });
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { widgetData } from "@/lib/widget/data";

export const dynamic = "force-dynamic";

/** Datos para el widget de iPhone (Scriptable). Público para el proxy de sesión, pero exige la clave personal (solo lectura). */
export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!/^bw_[A-Za-z0-9_-]{20,60}$/.test(token)) return json({ error: "Falta la clave del widget" }, 401);
  try {
    const d = await widgetData(createAdminClient(), token);
    return d ? json(d) : json({ error: "Clave no válida: crea otra en BiBuru → Ajustes → Widgets de iPhone" }, 401);
  } catch (e) {
    console.error("[widget]", e instanceof Error ? e.message : e);
    return json({ error: "No se pudo cargar" }, 500);
  }
}

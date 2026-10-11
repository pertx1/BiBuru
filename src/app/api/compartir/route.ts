import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { saveShared, shareMessage } from "@/lib/favorites/share";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // el análisis sigue en segundo plano (after) tras responder

const body = z.object({ clave: z.string().trim().min(10).max(100), enlace: z.string().trim().min(1).max(5000) });
const text = (msg: string, status = 200) => new NextResponse(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * Atajo de iPhone «Compartir → BiBuru». Público para el proxy de sesión, pero exige la clave personal.
 * Acepta JSON o formulario con `clave` y `enlace` (lo que se comparte: un enlace o un texto que lo lleve).
 * Responde texto corto para la notificación del atajo.
 */
export async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length") ?? 0) > 20_000) return text("Demasiado grande", 413);
  let raw: Record<string, unknown> = {};
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) raw = await request.json();
    else raw = Object.fromEntries((await request.formData()).entries());
  } catch { return text("Petición no válida", 400); }
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const p = body.safeParse({ clave: raw.clave ?? auth, enlace: raw.enlace ?? raw.url ?? raw.text });
  if (!p.success) return text("Falta la clave o el enlace. Revisa el atajo (BiBuru → Favoritos → Atajo de iPhone).", 400);
  try {
    const r = await saveShared(createAdminClient(), p.data.clave, p.data.enlace);
    if (!r) return text("Clave no válida. Crea una nueva en BiBuru → Favoritos → Atajo de iPhone y ponla en el atajo.", 401);
    return text(shareMessage(r));
  } catch (e) {
    console.error("[compartir]", e instanceof Error ? e.message : e);
    return text("No se pudo guardar ahora. Inténtalo de nuevo.", 500);
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { completeReminder, snoozeReminder } from "@/app/(app)/aviso/actions";
import { completeTask, snoozeTask } from "@/app/(app)/tareas/actions";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ kind: z.enum(["task", "reminder"]), refId: z.uuid(), action: z.enum(["done", "snooze"]) });

/**
 * Botones «Hecho» y «Posponer» de la notificación (Android y escritorio; iOS no muestra botones y abre
 * la pantalla del aviso). Exige sesión y que la petición venga de la propia web (anti-CSRF por Origin).
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== request.headers.get("host")) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const p = schema.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Petición no válida" }, { status: 400 });

  const { kind, refId, action } = p.data;
  const r = kind === "task"
    ? action === "done" ? await completeTask(refId) : await snoozeTask(refId, 60)
    : action === "done" ? await completeReminder(refId) : await snoozeReminder(refId, "1h");
  return NextResponse.json({ ok: r.ok }, { status: r.ok ? 200 : 400 });
}

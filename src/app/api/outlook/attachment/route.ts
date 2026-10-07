import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { msAttachmentBytes } from "@/lib/mail/graph";
import { accessTokenFor } from "@/lib/mail/service";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Descarga un adjunto bajo demanda (no se guarda en BiBuru). Solo de mensajes de las cuentas de quien lo pide. */
export async function GET(request: NextRequest) {
  const { supabase, userId } = await getContext();
  const p = z.object({ m: z.uuid(), a: z.string().min(1).max(500) }).safeParse({ m: request.nextUrl.searchParams.get("m"), a: request.nextUrl.searchParams.get("a") });
  if (!p.success) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  const { data: msg } = await supabase.from("mail_messages").select("graph_id, account_id").eq("id", p.data.m).maybeSingle(); // RLS: solo lo propio
  if (!msg) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const admin = createAdminClient();
  const { data: acc } = await admin.from("mail_accounts").select("id, refresh_token_enc").eq("id", msg.account_id).eq("user_id", userId).maybeSingle();
  if (!acc) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const token = await accessTokenFor(admin, acc);
  if (!token) return NextResponse.json({ error: "Vuelve a conectar la cuenta" }, { status: 401 });
  try {
    const res = await msAttachmentBytes(token, msg.graph_id, p.data.a);
    const name = (request.nextUrl.searchParams.get("n") ?? "adjunto").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 150);
    return new NextResponse(res.body, { headers: {
      "Content-Type": "application/octet-stream", // siempre descarga: nunca se interpreta en nuestro dominio
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return NextResponse.json({ error: "No se pudo descargar el adjunto" }, { status: 502 });
  }
}

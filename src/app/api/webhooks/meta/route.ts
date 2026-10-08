import { createHash, timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { ingestEvents } from "@/lib/inbox/service";
import { parseMetaWebhook, validMetaSignature } from "@/lib/inbox/logic";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Avisos en tiempo real de Meta (mensajes, comentarios y menciones de Instagram).
 * GET: verificación al configurar el webhook en el panel de Meta (hub.verify_token = META_WEBHOOK_VERIFY_TOKEN).
 * POST: solo se acepta con la firma correcta (X-Hub-Signature-256 con la clave secreta de la app). Responde enseguida y
 * guarda los mensajes después (Meta reintenta si tardamos).
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";
  const given = p.get("hub.verify_token") ?? "";
  if (p.get("hub.mode") === "subscribe" && expected.length >= 16 && timingSafeEqual(digest(given), digest(expected))) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "No autorizado" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const secret = process.env.INSTAGRAM_APP_SECRET?.trim() ?? "";
  if (!validMetaSignature(raw, request.headers.get("x-hub-signature-256"), secret)) return NextResponse.json({ error: "Firma no válida" }, { status: 401 });
  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  const events = parseMetaWebhook(body);
  if (events.length) after(() => ingestEvents(createAdminClient(), events).catch((e) => console.error("[webhook] meta:", e instanceof Error ? e.message : e)));
  return NextResponse.json({ ok: true });
}

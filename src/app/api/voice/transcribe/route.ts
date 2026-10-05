import { NextResponse, type NextRequest } from "next/server";
import { AiBlockedError } from "@/lib/ai/run";
import { sessionAiContext } from "@/lib/ai/session";
import { ALLOWED_AUDIO, MAX_AUDIO_BYTES, transcribeAudio } from "@/lib/ai/voice";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Dictado por voz: recibe el audio, devuelve solo el texto. El audio no se almacena en ninguna parte. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el audio" }, { status: 400 });
  const mime = file.type.split(";")[0].toLowerCase();
  if (!ALLOWED_AUDIO.includes(mime)) return NextResponse.json({ error: "Formato de audio no admitido" }, { status: 415 });
  if (file.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "El audio es demasiado largo (máx. ~90 s)" }, { status: 413 });
  if (file.size < 200) return NextResponse.json({ error: "No se oye nada" }, { status: 400 });

  try {
    const ctx = await sessionAiContext();
    const text = await transcribeAudio(ctx, { mimeType: mime, base64: Buffer.from(await file.arrayBuffer()).toString("base64") });
    return NextResponse.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AiBlockedError) return NextResponse.json({ error: e.message }, { status: e.reason === "busy" ? 429 : 402 });
    console.error("[voice]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo transcribir. Escríbelo a mano." }, { status: 502 });
  }
}

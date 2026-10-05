import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Comprueba el secreto de los endpoints de cron. Devuelve la respuesta de error, o null si todo está bien. */
export function checkCron(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET sin configurar" }, { status: 503 });
  if (secret.length < 20) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return timingSafeEqual(digest(given), digest(secret)) ? null : NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

import "server-only";
import { getContext } from "@/lib/context";
import { getTotalsByBusiness } from "@/lib/data";
import { addDays, nowLocal } from "@/lib/dates";
import { pickTotals } from "@/lib/home/finance";
import { homeRange } from "@/lib/home/period";
import { formatEUR } from "@/lib/money";
import { countInbox } from "@/lib/notes/data";
import { progressPct } from "@/lib/tasks/goals";
import { getCalendarItems, getNow, goalLike, listGoals, listTasks } from "@/lib/tasks/data";
import { geminiProvider, getModelNames } from "./gemini";
import { AiBlockedError, getAiContext, runAi } from "./run";

export type HomeNoteKind = "brief" | "suggestion";
/** La sugerencia se reutiliza este tiempo antes de poder pedir otra. */
export const SUGGESTION_TTL_MS = 3 * 60 * 60 * 1000;

/** Texto de IA guardado de hoy (o null). La sugerencia caduca a las 3 horas. */
export async function getHomeNote(kind: HomeNoteKind) {
  const { supabase, userId, workspaceId } = await getContext();
  const { date } = await getNow();
  const { data } = await supabase.from("ai_home_notes").select("content, created_at, updated_at").eq("user_id", userId).eq("workspace_id", workspaceId).eq("kind", kind).eq("day", date).maybeSingle();
  if (!data) return null;
  const left = SUGGESTION_TTL_MS - (Date.now() - Date.parse(data.updated_at)); // solo cuenta para la sugerencia
  return { ...data, stale: kind === "suggestion" && left <= 0, minutesLeft: Math.max(0, Math.round(left / 60000)) };
}

/** Lo que la IA necesita saber del día (solo títulos y cifras, sin textos largos). */
async function dayContext(): Promise<string> {
  const now = await getNow();
  const range = homeRange("mes", now.date);
  const [tasks, events, goals, inbox, cur, prev] = await Promise.all([
    listTasks("hoy"), getCalendarItems(now.date, addDays(now.date, 1)), listGoals({ status: "active" }), countInbox(),
    getTotalsByBusiness(range.current), getTotalsByBusiness(range.previous),
  ]);
  const late = tasks.filter((t) => t.due_date! < now.date), today = tasks.filter((t) => t.due_date === now.date);
  const t = pickTotals(cur), p = pickTotals(prev);
  const lines = [
    `Ahora: ${now.date} ${now.time.slice(0, 5)} (${now.timezone}).`,
    `Tareas atrasadas (${late.length}): ${late.slice(0, 10).map((x) => x.title).join("; ") || "ninguna"}.`,
    `Tareas de hoy (${today.length}): ${today.slice(0, 10).map((x) => `${x.due_time ? `${x.due_time.slice(0, 5)} ` : ""}${x.title}${x.priority >= 3 ? " [alta]" : ""}`).join("; ") || "ninguna"}.`,
    `Eventos hoy y mañana: ${events.filter((e) => e.kind === "event").slice(0, 8).map((e) => `${e.date === now.date ? "hoy" : "mañana"} ${e.allDay ? "todo el día" : e.startTime} ${e.title}`).join("; ") || "ninguno"}.`,
    `Negocios este mes hasta hoy: ventas ${formatEUR(t.income)} (mismo tramo del mes pasado ${formatEUR(p.income)}), gastos ${formatEUR(t.expense)}, beneficio ${formatEUR(t.profit)}.`,
    `Objetivos activos: ${goals.slice(0, 6).map((g) => `${g.title} ${progressPct(goalLike(g), g.live).pct.toFixed(0)} %${g.deadline ? ` (límite ${g.deadline})` : ""}`).join("; ") || "ninguno"}.`,
    `Capturas sin revisar en la bandeja: ${inbox}.`,
  ];
  return lines.join("\n");
}

const PROMPTS: Record<HomeNoteKind, { system: string; maxOutputTokens: number }> = {
  brief: {
    system: "Eres el asistente de BiBuru, el segundo cerebro de un emprendedor en España. Con los datos del día escribe un resumen breve en español de España: " +
      "3 a 5 viñetas cortas que empiecen por «- », con lo más importante (qué hacer primero, citas, cómo van los negocios frente al mes pasado). " +
      "Tono cercano y directo, sin saludos ni relleno, sin inventar datos y sin markdown aparte de las viñetas.",
    maxOutputTokens: 350,
  },
  suggestion: {
    system: "Eres el asistente de BiBuru. Con los datos del día y la hora actual, sugiere UNA sola acción concreta para hacer ahora mismo, " +
      "en español de España, en una o dos frases y explicando el porqué en pocas palabras. Prioriza lo atrasado o lo urgente. Sin saludos ni markdown.",
    maxOutputTokens: 150,
  },
};

/**
 * Genera (o devuelve el guardado) el texto de IA de Inicio. El resumen: una vez al día. La sugerencia: como mucho cada 3 horas.
 * Pasa siempre por `runAi` (presupuesto y límites); la fila única por día evita pagar dos veces si se piden a la vez.
 */
export async function generateHomeNote(kind: HomeNoteKind): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const existing = await getHomeNote(kind);
  if (existing && !existing.stale) return { ok: true, content: existing.content };
  if (!process.env.GEMINI_API_KEY) return { ok: false, error: "La IA no está configurada (falta la clave de Gemini)." };
  const { supabase, userId, workspaceId, timezone } = await getContext();
  const day = nowLocal(new Date(), timezone).date;
  try {
    const ctx = await getAiContext(geminiProvider(), getModelNames());
    const res = await runAi(ctx, "brief", {
      model: ctx.models.fast, system: PROMPTS[kind].system, contents: [{ role: "user", parts: [{ text: await dayContext() }] }],
      temperature: 0.4, maxOutputTokens: PROMPTS[kind].maxOutputTokens,
    });
    const content = res.text.trim().slice(0, 4000);
    if (!content) return { ok: false, error: "La IA no devolvió texto. Inténtalo más tarde." };
    const { error } = await supabase.from("ai_home_notes").upsert({ user_id: userId, workspace_id: workspaceId, kind, day, content }, { onConflict: "user_id,workspace_id,kind,day" });
    if (error) console.error("[ai-home] guardar:", error.message);
    return { ok: true, content };
  } catch (e) {
    if (e instanceof AiBlockedError) return { ok: false, error: e.message };
    console.error("[ai-home]", e instanceof Error ? e.message : e);
    return { ok: false, error: "No se pudo generar ahora. Inténtalo más tarde." };
  }
}

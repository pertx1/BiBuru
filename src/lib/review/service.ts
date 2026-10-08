import "server-only";
import { AiBlockedError, getAiContext, runAi } from "@/lib/ai/run";
import { geminiProvider, getModelNames } from "@/lib/ai/gemini";
import { getContext } from "@/lib/context";
import { nowLocal } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { inQuietHours } from "@/lib/notifications/planning";
import type { PushSub, Sender } from "@/lib/notifications/push";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { goalLike, listGoals } from "@/lib/tasks/data";
import { progressPct } from "@/lib/tasks/goals";
import { buildReviewData, reviewPushText, type ReviewData } from "./build";
import { isDue, REVIEW_KINDS, reviewPeriod, reviewPushKey, type ReviewKind, type ReviewPrefs } from "./period";

export type ReviewRow = { id: string; kind: string; period_start: string; period_end: string; data: Json; ai_summary: string | null; priorities: string[]; reviewed_at: string | null; created_at: string };
const COLS = "id, kind, period_start, period_end, data, ai_summary, priorities, reviewed_at, created_at";

/** Progreso de objetivos (solo con la sesión de la persona: se calcula al leer, como en Objetivos). */
async function goalsFor(business: string | null) {
  const goals = await listGoals({ status: "active", businessId: business ?? undefined });
  return goals.slice(0, 10).map((g) => ({ id: g.id, title: g.title, pct: Math.round(progressPct(goalLike(g), g.live).pct) }));
}

/**
 * La revisión actual de un tipo, con datos al momento (los puntos se pueden tocar). Se crea si no existe y, mientras no esté
 * «Revisado», su foto del histórico se actualiza con lo último que viste. Con filtro de negocio solo se calcula (no se guarda).
 */
export async function currentReview(kind: ReviewKind, business: string | null): Promise<{ row: ReviewRow | null; data: ReviewData }> {
  const { supabase, workspaceId, userId, timezone } = await getContext();
  const today = nowLocal(new Date(), timezone).date;
  const period = reviewPeriod(kind, today);
  const data = await buildReviewData({ supabase, workspaceId, userId }, period, today, business, { goals: () => goalsFor(business) });
  const { data: existing } = await supabase.from("reviews").select(COLS).eq("workspace_id", workspaceId).eq("user_id", userId).eq("kind", kind).eq("period_start", period.start).maybeSingle();
  if (business) return { row: existing, data: { ...data, priorities: existing?.priorities ?? [] } };
  if (!existing) {
    const { data: row, error } = await supabase.from("reviews").insert({ workspace_id: workspaceId, user_id: userId, kind, period_start: period.start, period_end: period.end, data: data as unknown as { [key: string]: Json } })
      .select(COLS).single();
    if (error && error.code !== "23505") console.error("[review] crear", error.message);
    return { row: row ?? null, data };
  }
  if (!existing.reviewed_at) await supabase.from("reviews").update({ data: { ...data, priorities: existing.priorities } as unknown as { [key: string]: Json } }).eq("id", existing.id).eq("workspace_id", workspaceId);
  return { row: existing, data: { ...data, priorities: existing.priorities } };
}

export async function listReviews(kind: ReviewKind, limit = 30): Promise<ReviewRow[]> {
  const { supabase, workspaceId, userId } = await getContext();
  const { data } = await supabase.from("reviews").select(COLS).eq("workspace_id", workspaceId).eq("user_id", userId).eq("kind", kind).order("period_start", { ascending: false }).limit(limit);
  return data ?? [];
}

export async function getReview(id: string): Promise<ReviewRow | null> {
  const { supabase, workspaceId, userId } = await getContext();
  const { data } = await supabase.from("reviews").select(COLS).eq("id", id).eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  return data;
}

/** Revisiones sin cerrar (siguen en Inicio hasta pulsar «Revisado»). Nunca lanza. */
export async function openReviews(): Promise<{ id: string; kind: ReviewKind; period_start: string; period_end: string }[]> {
  try {
    const { supabase, workspaceId, userId } = await getContext();
    const { data } = await supabase.from("reviews").select("id, kind, period_start, period_end").eq("workspace_id", workspaceId).eq("user_id", userId).is("reviewed_at", null)
      .order("period_start", { ascending: false }).limit(10);
    // Solo la más reciente de cada tipo (una diaria de hace una semana ya no hace falta en Inicio).
    const seen = new Set<string>();
    return (data ?? []).filter((r) => (seen.has(r.kind) ? false : (seen.add(r.kind), true))) as { id: string; kind: ReviewKind; period_start: string; period_end: string }[];
  } catch { return []; }
}

const SYSTEM = "Eres el asistente de BiBuru, el segundo cerebro de un emprendedor en España. Con las cifras de su revisión escribe UN párrafo breve " +
  "(3 a 5 frases) en español de España: cómo ha ido frente al periodo anterior, qué destaca y qué haría primero. Sin inventar datos, sin saludos ni markdown.";

/** Párrafo de resumen con IA (a petición, dentro del presupuesto mensual). Se guarda en la revisión. */
export async function summarizeReview(id: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const row = await getReview(id);
  if (!row) return { ok: false, error: "Revisión no encontrada" };
  if (row.ai_summary) return { ok: true, text: row.ai_summary };
  if (!process.env.GEMINI_API_KEY) return { ok: false, error: "La IA no está configurada (falta la clave de Gemini)." };
  const d = row.data as unknown as ReviewData;
  const { supabase, workspaceId } = await getContext();
  const facts = [
    `Revisión ${row.kind} del ${row.period_start} al ${row.period_end}.`,
    `${d.money.curLabel}: ingresos ${formatEUR(d.money.cur.income)}, gastos ${formatEUR(d.money.cur.expense)}, beneficio ${formatEUR(d.money.cur.profit)}.`,
    d.money.prevLabel ? `${d.money.prevLabel}: ingresos ${formatEUR(d.money.prev.income)}, gastos ${formatEUR(d.money.prev.expense)}, beneficio ${formatEUR(d.money.prev.profit)}.` : "",
    d.monthToDate ? `Lo que va de mes: beneficio ${formatEUR(d.monthToDate.profit)}.` : "",
    `Pedidos: ${d.orders.count}. Pendiente de cobro: ${formatEUR(d.receivable.totalCents)} en ${d.receivable.count} pedidos.`,
    d.orders.topProducts.length ? `Más vendidos: ${d.orders.topProducts.map((p) => `${p.label} (${p.units})`).join(", ")}.` : "",
    `Tareas: ${d.tasks.today.length} hoy, ${d.tasks.overdue.length} atrasadas, ${d.tasks.noDateTotal} sin fecha, ${d.tasks.done} hechas, ${d.tasks.open} pendientes.`,
    `Sin responder: ${d.inbox.mail} correos y ${d.inbox.social} mensajes. Stock por pedir: ${d.stock.length}.`,
    d.social ? `Redes: ${d.social.gained >= 0 ? "+" : ""}${d.social.gained} seguidores.` : "",
    d.goals?.length ? `Objetivos: ${d.goals.map((g) => `${g.title} ${g.pct} %`).join("; ")}.` : "",
  ].filter(Boolean).join("\n");
  try {
    const ctx = await getAiContext(geminiProvider(), getModelNames());
    const res = await runAi(ctx, "review", { model: ctx.models.fast, system: SYSTEM, contents: [{ role: "user", parts: [{ text: facts }] }], temperature: 0.4, maxOutputTokens: 300 });
    const text = res.text.trim().slice(0, 3000);
    if (!text) return { ok: false, error: "La IA no devolvió texto. Inténtalo más tarde." };
    await supabase.from("reviews").update({ ai_summary: text }).eq("id", id).eq("workspace_id", workspaceId);
    return { ok: true, text };
  } catch (e) {
    if (e instanceof AiBlockedError) return { ok: false, error: e.message };
    console.error("[review] ia", e instanceof Error ? e.message : e);
    return { ok: false, error: "No se pudo generar ahora. Inténtalo más tarde." };
  }
}

// ------------------------------------------------------------------ cron: generar a su hora y avisar
type ProfileRow = ReviewPrefs & { user_id: string; default_workspace_id: string | null; timezone: string; quiet_hours_start: string; quiet_hours_end: string };

/**
 * Cada minuto (dentro del cron de avisos): para cada persona, genera las revisiones que ya tocan (una por periodo, con su foto)
 * y avisa una vez (`notification_log`), fuera de las horas de silencio. Nunca lanza: un fallo de una persona no para a las demás.
 */
export async function runReviewCron(admin: AdminClient, send: Sender | null, now: Date = new Date()): Promise<{ created: number; notified: number }> {
  const out = { created: 0, notified: 0 };
  const { data: profiles, error } = await admin.from("profiles").select("user_id, default_workspace_id, timezone, quiet_hours_start, quiet_hours_end, review_daily_enabled, review_daily_time, review_weekly_enabled, review_weekly_dow, review_weekly_time, review_monthly_enabled, review_monthly_time");
  if (error) { console.error("[review] cron perfiles", error.message); return out; }
  for (const p of (profiles ?? []) as ProfileRow[]) {
    if (!p.default_workspace_id) continue;
    try {
      const local = nowLocal(now, p.timezone);
      for (const kind of REVIEW_KINDS) {
        if (!isDue(kind, p, local)) continue;
        const period = reviewPeriod(kind, local.date);
        const { data: existing } = await admin.from("reviews").select("id, data, notified_at").eq("workspace_id", p.default_workspace_id).eq("user_id", p.user_id).eq("kind", kind).eq("period_start", period.start).maybeSingle();
        let row = existing;
        if (!row) {
          const data = await buildReviewData({ supabase: admin, workspaceId: p.default_workspace_id, userId: p.user_id }, period, local.date, null);
          const { data: inserted, error: e } = await admin.from("reviews").upsert({ workspace_id: p.default_workspace_id, user_id: p.user_id, kind, period_start: period.start, period_end: period.end, data: data as unknown as { [key: string]: Json } },
            { onConflict: "workspace_id,user_id,kind,period_start", ignoreDuplicates: true }).select("id, data, notified_at");
          if (e) { console.error("[review] cron crear", e.message); continue; }
          row = inserted?.[0] ?? null;
          if (!row) continue; // otra pasada la creó a la vez
          out.created++;
        }
        if (row.notified_at || !send) continue;
        if (inQuietHours(local.time, String(p.quiet_hours_start).slice(0, 5), String(p.quiet_hours_end).slice(0, 5))) continue; // se avisa al terminar el silencio
        const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", p.user_id);
        await admin.from("reviews").update({ notified_at: now.toISOString() }).eq("id", row.id);
        if (!subs?.length) continue;
        const { data: claimed } = await admin.from("notification_log").upsert({ user_id: p.user_id, dedupe_key: reviewPushKey(kind, period.start), kind: "review" }, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id");
        if (!claimed?.length) continue;
        const text = reviewPushText(row.data as unknown as ReviewData, formatEUR);
        for (const s of subs as PushSub[]) await send(s, { title: text.title, body: text.body, url: `/revision?tab=${kind}`, kind: "review", tag: reviewPushKey(kind, period.start) });
        out.notified++;
      }
    } catch (e) { console.error("[review] cron", p.user_id, e instanceof Error ? e.message : e); }
  }
  return out;
}

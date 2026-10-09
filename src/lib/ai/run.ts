import "server-only";
import { nowLocal, zonedToUtc } from "@/lib/dates";
import { getContext } from "@/lib/context";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BLOCKED_MESSAGE, budgetState, canSpend, costMicros, DEFAULT_PRICES, monthBounds, type BudgetState, type Feature, type Price } from "./pricing";
import { AiError, type AiProvider, type AiRequest, type AiResponse } from "./provider";

type Db = SupabaseClient<Database>;

export type AiContext = {
  supabase: Db;
  workspaceId: string;
  userId: string;
  timezone: string;
  budgetCents: number;
  provider: AiProvider;
  models: { fast: string; video: string };
  maxPerMinute?: number;                 // por defecto AI_MAX_RPM o 10
  sleep?: (ms: number) => Promise<void>; // inyectable para tests
  now?: () => Date;
  onWarn?: (state: BudgetState) => Promise<void>; // p. ej. enviar el aviso del 80 %
};

export class AiBlockedError extends Error {
  constructor(readonly reason: "blocked" | "would_exceed" | "busy" | "disabled", message: string) { super(message); }
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Precio de un modelo: el configurado por la persona o, si no, el de la aplicación. */
export async function priceFor(ctx: Pick<AiContext, "supabase" | "workspaceId" | "models">, model: string): Promise<Price> {
  const { data } = await ctx.supabase.from("ai_prices").select("input_eur_per_mtok, output_eur_per_mtok").eq("workspace_id", ctx.workspaceId).eq("model", model).maybeSingle();
  if (data) return { input: Number(data.input_eur_per_mtok), output: Number(data.output_eur_per_mtok) };
  return model === ctx.models.video ? DEFAULT_PRICES.video : DEFAULT_PRICES.fast;
}

/** Gasto del mes en curso (hora local) y su estado respecto al presupuesto. */
export async function getBudget(ctx: Pick<AiContext, "supabase" | "workspaceId" | "timezone" | "budgetCents" | "now">): Promise<BudgetState & { monthKey: string; byFeature: { feature: string; calls: number; input: number; output: number; costMicros: number }[] }> {
  const now = ctx.now?.() ?? new Date();
  const m = monthBounds(nowLocal(now, ctx.timezone).date);
  const { data, error } = await ctx.supabase.rpc("ai_spend", { ws: ctx.workspaceId, p_from: zonedToUtc(m.from, "00:00", ctx.timezone).toISOString(), p_to: zonedToUtc(m.to, "00:00", ctx.timezone).toISOString() });
  if (error) throw new Error(`ai_spend: ${error.message}`);
  const byFeature = data.map((r) => ({ feature: r.feature, calls: r.calls, input: r.input_tokens, output: r.output_tokens, costMicros: r.cost_micros }));
  const spent = byFeature.reduce((s, r) => s + r.costMicros, 0);
  return { ...budgetState(spent, ctx.budgetCents), monthKey: m.key, byFeature };
}

/** Contexto de IA del usuario conectado (presupuesto desde su perfil). */
export async function getAiContext(provider: AiProvider, models: { fast: string; video: string }): Promise<AiContext> {
  const { supabase, workspaceId, userId, timezone } = await getContext();
  const { data: profile } = await supabase.from("profiles").select("ai_monthly_budget_cents").eq("user_id", userId).maybeSingle();
  return { supabase, workspaceId, userId, timezone, budgetCents: profile?.ai_monthly_budget_cents ?? 1000, provider, models };
}

/**
 * Única puerta de entrada a la IA. Antes de llamar: comprueba el presupuesto (bloquea al 100 %) y el límite de
 * peticiones por minuto (para convivir con el plan gratuito). Al llamar: reintenta con espera ante 429/503.
 * Después: registra tokens y coste estimado en `ai_usage` y avisa al cruzar el 80 %.
 */
export async function runAi(ctx: AiContext, feature: Feature, req: AiRequest, opts: { estimatedMicros?: number } = {}): Promise<AiResponse & { costMicros: number }> {
  const sleep = ctx.sleep ?? realSleep;
  const budget = await getBudget(ctx);
  const allowed = canSpend(budget, opts.estimatedMicros ?? 0);
  if (!allowed.ok) {
    throw new AiBlockedError(allowed.reason, allowed.reason === "blocked" ? BLOCKED_MESSAGE : "Esta operación costaría más de lo que te queda de presupuesto este mes.");
  }

  const limit = ctx.maxPerMinute ?? Number(process.env.AI_MAX_RPM ?? 10);
  const { data: recent } = await ctx.supabase.rpc("ai_recent_calls", { ws: ctx.workspaceId, seconds: 60 });
  if (Number(recent ?? 0) >= limit) throw new AiBlockedError("busy", "Demasiadas peticiones a la IA en el último minuto. Espera unos segundos y vuelve a intentarlo.");

  // Se anota el intento antes (cuenta para el límite por minuto aunque falle) y se completa después.
  const { data: row } = await ctx.supabase.from("ai_usage").insert({ workspace_id: ctx.workspaceId, user_id: ctx.userId, feature, model: req.model, ok: false }).select("id").single();

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await ctx.provider.generate(req);
      const price = await priceFor(ctx, req.model);
      const cost = costMicros(res.usage.inputTokens, res.usage.outputTokens, price);
      if (row) await ctx.supabase.from("ai_usage").update({ input_tokens: res.usage.inputTokens, output_tokens: res.usage.outputTokens, cost_micros: cost, ok: true }).eq("id", row.id);
      const after = budgetState(budget.spentMicros + cost, ctx.budgetCents);
      if (budget.level === "ok" && after.level !== "ok" && ctx.onWarn) await ctx.onWarn(after).catch(() => {});
      return { ...res, costMicros: cost };
    } catch (e) {
      lastError = e;
      const retryable = e instanceof AiError && e.retryable;
      if (!retryable || attempt === 2) break;
      // Límite de uso (429): reintentar al segundo solo gasta más cupo. Se espera lo que pide Gemini si es poco;
      // si no, quien llama decide (los vídeos vuelven a la cola con la espera indicada).
      if (e instanceof AiError && e.status === 429) {
        if (e.retryAfterMs === undefined || e.retryAfterMs > 15_000 || /PerDay/.test(e.message)) break;
        await sleep(e.retryAfterMs + 500);
        continue;
      }
      await sleep(1000 * 2 ** attempt + Math.floor(Math.random() * 250)); // 1 s, 2 s (+ ruido)
    }
  }
  const msg = lastError instanceof Error ? lastError.message.slice(0, 280) : "Error de IA";
  if (row) await ctx.supabase.from("ai_usage").update({ error: msg }).eq("id", row.id);
  throw lastError instanceof AiError ? lastError : new AiError(msg);
}

import "server-only";
import { getContext } from "@/lib/context";
import { webPushSender } from "@/lib/notifications/push";
import { geminiProvider, getModelNames, hasGeminiKey } from "./gemini";
import type { BudgetState } from "./pricing";
import { AiBlockedError, type AiContext } from "./run";
import type { Actor } from "./actors";

/** Contexto de IA para el usuario conectado. Falla con un mensaje claro si falta la clave de Gemini. */
export async function sessionAiContext(): Promise<AiContext & { autoApply: boolean }> {
  const c = await getContext();
  if (!hasGeminiKey()) throw new AiBlockedError("disabled", "La IA no está configurada todavía (falta GEMINI_API_KEY en el servidor).");
  const { data: p } = await c.supabase.from("profiles").select("ai_monthly_budget_cents, ai_auto_apply, ai_alert_month").eq("user_id", c.userId).maybeSingle();
  return {
    supabase: c.supabase, workspaceId: c.workspaceId, userId: c.userId, timezone: c.timezone,
    budgetCents: p?.ai_monthly_budget_cents ?? 1000, autoApply: p?.ai_auto_apply ?? false,
    provider: geminiProvider(), models: getModelNames(),
    onWarn: async (state: BudgetState) => {
      // Aviso único al cruzar el 80 % del mes (y otro al llegar al 100 %).
      const key = `${new Date().toISOString().slice(0, 7)}:${state.level}`;
      if (p?.ai_alert_month === key) return;
      await c.supabase.from("profiles").update({ ai_alert_month: key }).eq("user_id", c.userId);
      const { data: subs } = await c.supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", c.userId);
      if (!subs?.length) return;
      const send = webPushSender();
      const pct = Math.round(state.pct);
      await Promise.all(subs.map((s) => send(s, { title: state.level === "blocked" ? "Presupuesto de IA agotado" : `Has gastado el ${pct} % del presupuesto de IA`, body: state.level === "blocked" ? "La IA se pausa hasta el mes que viene. La captura sigue funcionando." : "Revisa el consumo en Ajustes → IA.", url: "/ajustes", kind: "ai-budget", tag: "ai-budget" })));
    },
  };
}

/** Igual que sessionAiContext pero con el `actor` listo (para chat y acciones). */
export async function sessionAiActorContext() {
  const ctx = await sessionAiContext();
  return { ...ctx, actor: { supabase: ctx.supabase, workspaceId: ctx.workspaceId, userId: ctx.userId, timezone: ctx.timezone } satisfies Actor };
}

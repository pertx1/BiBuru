import "server-only";
import { nowLocal } from "@/lib/dates";
import type { Json } from "@/lib/supabase/database.types";
import { createEvent, createGoal, createNote, createTask, ActionError, type Actor, type Created } from "./actors";
import { buildClassifyPrompt, canAutoApply, linkProposal, nextRetryDelayMinutes, parseProposal, proposalJsonSchema, weekdayName, type Proposal } from "./classify";
import { AiBlockedError, runAi, type AiContext } from "./run";

export type ClassifyOutcome = "proposed" | "applied" | "retry" | "blocked" | "skipped";

/** Aplica una propuesta que no es dinero. Gastos y pedidos NO pasan por aquí: siempre los confirma la persona. */
export async function applyProposal(a: Actor, p: Proposal): Promise<Created> {
  const common = { business: p.business, tags: p.tags };
  switch (p.kind) {
    case "task": return createTask(a, { title: p.title, date: p.date, time: p.time, priority: p.priority, notes: p.body, folder: p.folder, ...common });
    case "note": return createNote(a, { title: p.title, body: p.body, folder: p.folder, ...common });
    case "idea": return createNote(a, { title: p.title, body: p.body, folder: p.folder, business: p.business, tags: [...new Set([...p.tags, "idea"])] });
    case "event": return createEvent(a, { title: p.title, date: p.date!, time: p.time, end_time: p.end_time, business: p.business, notes: p.body });
    case "goal": return createGoal(a, { title: p.title, measure: p.goal?.measure, target: p.goal?.target, deadline: p.date, business: p.business, description: p.body });
    default: throw new ActionError(p.kind === "link" ? "Los enlaces se guardan en Favoritos." : "Este tipo requiere confirmación.");
  }
}

async function loadContext(a: Actor, today: string, timezone: string) {
  const [biz, folders, tags, cats] = await Promise.all([
    a.supabase.from("businesses").select("name, description").eq("workspace_id", a.workspaceId).eq("archived", false).limit(30),
    a.supabase.from("folders").select("name").eq("workspace_id", a.workspaceId).limit(40),
    a.supabase.from("tags").select("name").eq("workspace_id", a.workspaceId).limit(60),
    a.supabase.from("expense_categories").select("name").eq("workspace_id", a.workspaceId).limit(30),
  ]);
  return { today, weekday: weekdayName(today), timezone, businesses: biz.data ?? [], folders: (folders.data ?? []).map((f) => f.name), tags: (tags.data ?? []).map((t) => t.name), expenseCategories: (cats.data ?? []).map((c) => c.name) };
}

/**
 * Clasifica una captura y guarda la propuesta. La captura NUNCA se pierde: si la IA falla o está bloqueada, queda
 * pendiente (con reintento programado) y la persona puede clasificarla a mano.
 */
export async function classifyInboxItem(ctx: AiContext & { autoApply: boolean }, itemId: string): Promise<ClassifyOutcome> {
  const { supabase, workspaceId } = ctx;
  const { data: item } = await supabase.from("inbox_items").select("id, raw_text, status, ai_attempts").eq("id", itemId).eq("workspace_id", workspaceId).maybeSingle();
  if (!item || item.status !== "pending") return "skipped";
  const actor: Actor = { supabase, workspaceId, userId: ctx.userId, timezone: ctx.timezone };
  const now = ctx.now?.() ?? new Date();

  const save = (patch: Record<string, unknown>) => supabase.from("inbox_items").update(patch as never).eq("id", itemId).eq("workspace_id", workspaceId);

  const link = linkProposal(item.raw_text);
  if (link) { await save({ status: "proposed", proposal: link as unknown as Json, ai_last_error: null }); return "proposed"; } // sin gastar IA

  try {
    await save({ status: "processing" });
    const local = nowLocal(now, ctx.timezone);
    const res = await runAi(ctx, "classify", {
      model: ctx.models.fast, system: buildClassifyPrompt(await loadContext(actor, local.date, ctx.timezone)),
      contents: [{ role: "user", parts: [{ text: item.raw_text.slice(0, 4000) }] }], jsonSchema: proposalJsonSchema(), temperature: 0.1, maxOutputTokens: 800,
    });
    const proposal = parseProposal(res.text);
    if (!proposal) throw new Error("La IA no devolvió un JSON válido");

    if (ctx.autoApply && canAutoApply(proposal)) {
      try {
        const created = await applyProposal(actor, proposal);
        await save({ status: "accepted", processed_at: now.toISOString(), proposal: { ...proposal, auto: true, result: { kind: created.kind, id: created.id, label: created.label, href: created.href } } as unknown as Json, ai_last_error: null });
        return "applied";
      } catch { /* si no se pudo aplicar sola, se deja como propuesta para la persona */ }
    }
    await save({ status: "proposed", proposal: proposal as unknown as Json, ai_last_error: null });
    return "proposed";
  } catch (e) {
    if (e instanceof AiBlockedError && e.reason !== "busy") { await save({ status: "pending", ai_last_error: "IA no disponible (presupuesto)", ai_next_try_at: null }); return "blocked"; }
    const attempts = item.ai_attempts + 1;
    const delay = e instanceof AiBlockedError ? 1 : nextRetryDelayMinutes(item.ai_attempts);
    await save({
      status: "pending", ai_attempts: attempts, ai_last_error: (e instanceof Error ? e.message : "Error").slice(0, 280),
      ai_next_try_at: delay === null ? null : new Date(now.getTime() + delay * 60_000).toISOString(),
    });
    return "retry";
  }
}

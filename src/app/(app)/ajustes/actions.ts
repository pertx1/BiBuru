"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { webPushSender } from "@/lib/notifications/push";
import type { ActionResult } from "@/lib/schemas";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida");

const subSchema = z.object({
  endpoint: z.url().max(2000).refine((u) => u.startsWith("https://"), "Solo https"),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(10).max(100) }),
  userAgent: z.string().max(300).optional(),
});

/** Registra este dispositivo para recibir avisos (una suscripción por dispositivo; repetir actualiza). */
export async function savePushSubscription(input: z.input<typeof subSchema>): Promise<ActionResult> {
  const p = subSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Suscripción no válida" };
  const { supabase, workspaceId, userId } = await getContext();
  const { error } = await supabase.from("push_subscriptions").upsert(
    { workspace_id: workspaceId, user_id: userId, endpoint: p.data.endpoint, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth, user_agent: p.data.userAgent ?? null },
    { onConflict: "endpoint" },
  );
  if (error) { console.error("[push] save:", error.message); return { ok: false, error: "No se pudo registrar este dispositivo" }; }
  revalidatePath("/ajustes");
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  if (!z.url().safeParse(endpoint).success) return { ok: false, error: "Dispositivo no válido" };
  const { supabase, userId } = await getContext();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", userId);
  if (error) return { ok: false, error: "No se pudo quitar el dispositivo" };
  revalidatePath("/ajustes");
  return { ok: true };
}

/** Envía un aviso de prueba a todos tus dispositivos, para comprobar que todo funciona. */
export async function sendTestPush(): Promise<ActionResult & { sent?: number }> {
  const { supabase, userId } = await getContext();
  const { data: subs } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  if (!subs?.length) return { ok: false, error: "Este usuario no tiene ningún dispositivo registrado." };
  let send;
  try { send = webPushSender(); } catch { return { ok: false, error: "Faltan las claves VAPID en el servidor (ver README)." }; }
  const results = await Promise.all(subs.map((s) => send(s, { title: "BiBuru · aviso de prueba", body: "Si ves esto, los avisos funcionan en este dispositivo ✔", url: "/ajustes", kind: "test", tag: "test" })));
  const gone = subs.filter((_, i) => { const r = results[i]; return !r.ok && r.gone; }).map((s) => s.id);
  if (gone.length) await supabase.from("push_subscriptions").delete().in("id", gone);
  const sent = results.filter((r) => r.ok).length;
  revalidatePath("/ajustes");
  return sent > 0 ? { ok: true, sent } : { ok: false, error: "El servicio de avisos rechazó el envío. Vuelve a activar los avisos en este dispositivo." };
}

const settingsSchema = z.object({
  task_lead_minutes: z.number().int().min(0).max(1440),
  event_lead_minutes: z.number().int().min(0).max(1440),
  quiet_hours_start: hhmm, quiet_hours_end: hhmm,
  daily_digest_enabled: z.boolean(), daily_digest_time: hhmm,
  overdue_alert_enabled: z.boolean(), overdue_alert_time: hhmm,
  weekly_review_enabled: z.boolean(), weekly_review_dow: z.number().int().min(0).max(6), weekly_review_time: hhmm,
});
export type NotificationSettings = z.infer<typeof settingsSchema>;

export async function saveNotificationSettings(input: NotificationSettings): Promise<ActionResult> {
  const p = settingsSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos no válidos" };
  const { supabase, userId } = await getContext();
  const { error } = await supabase.from("profiles").update(p.data).eq("user_id", userId);
  if (error) { console.error("[settings] notifications:", error.message); return { ok: false, error: "No se pudo guardar" }; }
  revalidatePath("/ajustes");
  return { ok: true };
}

const aiSchema = z.object({
  budget_eur: z.number().min(0).max(1000),
  auto_apply: z.boolean(),
  prices: z.array(z.object({ model: z.string().trim().min(1).max(80), input: z.number().min(0).max(1000), output: z.number().min(0).max(1000) })).max(10),
});
export type AiSettings = z.infer<typeof aiSchema>;

/** Presupuesto mensual de IA, autoaplicación y precios por modelo (los precios reales los pone la persona). */
export async function saveAiSettings(input: AiSettings): Promise<ActionResult> {
  const p = aiSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos no válidos" };
  const { supabase, userId, workspaceId } = await getContext();
  const { error } = await supabase.from("profiles").update({ ai_monthly_budget_cents: Math.round(p.data.budget_eur * 100), ai_auto_apply: p.data.auto_apply }).eq("user_id", userId);
  if (error) { console.error("[settings] ai:", error.message); return { ok: false, error: "No se pudo guardar" }; }
  if (p.data.prices.length) {
    const { error: e2 } = await supabase.from("ai_prices").upsert(
      p.data.prices.map((x) => ({ workspace_id: workspaceId, user_id: userId, model: x.model, input_eur_per_mtok: x.input, output_eur_per_mtok: x.output })),
      { onConflict: "workspace_id,model" },
    );
    if (e2) { console.error("[settings] ai prices:", e2.message); return { ok: false, error: "No se pudieron guardar los precios" }; }
  }
  revalidatePath("/ajustes");
  return { ok: true };
}

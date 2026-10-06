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

/**
 * Borra la cuenta y TODOS sus datos (irreversible). Exige escribir el correo. Orden: tickets del almacenamiento,
 * acceso de Google (mejor esfuerzo) y, por último, el usuario (las claves foráneas en cascada borran el resto).
 */
export async function deleteAccount(confirmEmail: string): Promise<ActionResult> {
  const { supabase, userId, workspaceId } = await getContext();
  const { data: auth } = await supabase.auth.getUser();
  const email = auth.user?.email?.toLowerCase();
  if (!email || confirmEmail.trim().toLowerCase() !== email) return { ok: false, error: "Escribe tu correo exactamente para confirmar." };
  try {
    const admin = (await import("@/lib/supabase/admin")).createAdminClient();
    const { data: tok } = await admin.from("integrations").select("refresh_token_enc").eq("user_id", userId).eq("provider", "google").maybeSingle();
    if (tok) {
      try {
        const { decryptSecret } = await import("@/lib/favorites/crypto");
        await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: decryptSecret(tok.refresh_token_enc) }), signal: AbortSignal.timeout(8000) });
      } catch { /* mejor esfuerzo */ }
    }
    const bucket = admin.storage.from("receipts");
    const { data: dirs } = await bucket.list(workspaceId, { limit: 1000 });
    for (const d of dirs ?? []) {
      const { data: files } = await bucket.list(`${workspaceId}/${d.name}`, { limit: 1000 });
      if (files?.length) await bucket.remove(files.map((f) => `${workspaceId}/${d.name}/${f.name}`));
    }
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  } catch (e) {
    console.error("[account] delete:", e instanceof Error ? e.message : e);
    return { ok: false, error: "No se pudo borrar la cuenta. Inténtalo de nuevo o escríbeme." };
  }
  await supabase.auth.signOut().catch(() => {});
  return { ok: true };
}

/**
 * Genera claves nuevas para la configuración (VAPID de avisos, secreto del cron y clave de cifrado de Google).
 * Solo para quien ha iniciado sesión; NO se guardan en ningún sitio: se muestran una vez para pegarlas en Vercel.
 */
export async function generateSetupKeys(): Promise<ActionResult & { keys?: Record<string, string> }> {
  await getContext(); // exige sesión
  const { randomBytes } = await import("node:crypto");
  const webpush = (await import("web-push")).default;
  const v = webpush.generateVAPIDKeys();
  return {
    ok: true,
    keys: {
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: v.publicKey,
      VAPID_PRIVATE_KEY: v.privateKey,
      CRON_SECRET: randomBytes(32).toString("base64url"),
      TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    },
  };
}

export type ProfityPreview = {
  email: string | null; exportedAt: string | null; warnings: string[]; vinted: number;
  totals: { label: string; count: number; amount: string }[];
};

async function profityPlanFrom(text: string, separateVinted: boolean) {
  const { parseProfityJson } = await import("@/lib/profity-json");
  const { buildPlan } = await import("@/lib/profity-import");
  if (text.length > 3_900_000) return { error: "El archivo es demasiado grande (máximo 3,9 MB)." } as const;
  const r = parseProfityJson(text);
  if (!r.ok) return { error: r.error } as const;
  return { parsed: r.data, plan: buildPlan(r.data.source, { separateVinted }) } as const;
}

/** Paso 1: lee el JSON de PROFITY y enseña qué se va a importar (no escribe nada). */
export async function previewProfityImport(text: string): Promise<ActionResult & { preview?: ProfityPreview }> {
  await getContext();
  const r = await profityPlanFrom(String(text ?? ""), true);
  if ("error" in r) return { ok: false, error: r.error! };
  const { expectedTotals } = await import("@/lib/profity-import");
  const t = expectedTotals(r.plan);
  const eur = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  return {
    ok: true,
    preview: {
      email: r.parsed.email, exportedAt: r.parsed.exportedAt, warnings: r.plan.warnings,
      vinted: r.plan.expenses.filter((e) => e.biz === "vinted").length + r.plan.incomes.filter((i) => i.biz === "vinted").length,
      totals: [
        { label: "Pedidos", count: t.orders.count, amount: eur(t.orders.totalCents) },
        { label: "Gastos", count: t.expenses.count, amount: eur(t.expenses.totalCents) },
        { label: "Ingresos", count: t.incomes.count, amount: eur(t.incomes.totalCents) },
        { label: "Stock de prendas", count: t.tshirtStocks.count, amount: `${t.tshirtStocks.totalCents} uds` },
        { label: "Stock DTF", count: t.dtfStocks.count, amount: `${t.dtfStocks.totalCents} uds` },
        { label: "Facturas", count: t.invoices.count, amount: "" },
      ],
    },
  };
}

const importNames = z.object({ main: z.string().trim().min(1).max(60), vinted: z.string().trim().max(60), separateVinted: z.boolean() });

/** Paso 2: importa (repetible sin duplicar) y devuelve la conciliación origen ↔ destino. */
export async function runProfityImport(text: string, names: z.infer<typeof importNames>): Promise<ActionResult & { rows?: import("@/lib/profity-apply").ReconRow[]; allOk?: boolean; summary?: string }> {
  const n = importNames.safeParse(names);
  if (!n.success) return { ok: false, error: "Indica el nombre del negocio." };
  const { supabase, workspaceId, userId } = await getContext();
  const r = await profityPlanFrom(String(text ?? ""), n.data.separateVinted);
  if ("error" in r) return { ok: false, error: r.error! };
  try {
    const { applyProfityPlan } = await import("@/lib/profity-apply");
    const vintedName = n.data.separateVinted ? (n.data.vinted || "Vinted") : "";
    const res = await applyProfityPlan(supabase, { workspaceId, userId }, r.plan, { main: n.data.main, vinted: vintedName });
    revalidatePath("/", "layout");
    const im = res.imported;
    return { ok: true, rows: res.rows, allOk: res.ok, summary: `Importados ${im.orders} pedidos, ${im.expenses} gastos y ${im.incomes} ingresos nuevos (ya estaban ${im.ordersExisting}, ${im.expensesExisting} y ${im.incomesExisting}).` };
  } catch (e) {
    console.error("[profity] import:", e instanceof Error ? e.message : e);
    return { ok: false, error: `No se pudo completar la importación: ${e instanceof Error ? e.message.slice(0, 200) : "error desconocido"}. Puedes repetirla: no duplica.` };
  }
}

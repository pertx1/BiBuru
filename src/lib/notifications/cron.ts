import "server-only";
import { addDays, nowLocal } from "@/lib/dates";
import type { AdminClient } from "@/lib/supabase/admin";
import {
  eventOccurrences, inQuietHours, planDailyDigest, planMailPushes, planNewsPush, planEventReminders, planOverdueAlert, planTaskReminders, planWeeklyReview, type Prefs, type Push,
} from "./planning";
import type { PushPayload, PushSub, Sender } from "./push";
import { notificationText, type DigestContent, type DigestStatus } from "@/lib/news/digest";

export type CronSummary = { users: number; sent: number; failed: number; quiet: number; removedSubscriptions: number };

type Profile = Prefs & { user_id: string; default_workspace_id: string | null; timezone: string };

/**
 * Se ejecuta cada minuto (Supabase Cron → /api/cron/reminders). Idempotente: cada aviso se «reclama» en
 * notification_log antes de enviarse, así minutos repetidos o dos ejecuciones simultáneas no lo duplican.
 * Si ningún dispositivo lo recibe por un fallo temporal, se libera la reclamación para reintentarlo.
 */
export async function runReminders(admin: AdminClient, send: Sender, now: Date = new Date()): Promise<CronSummary> {
  const summary: CronSummary = { users: 0, sent: 0, failed: 0, quiet: 0, removedSubscriptions: 0 };

  const { data: subs, error } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth");
  if (error) throw new Error(`push_subscriptions: ${error.message}`);
  if (subs.length === 0) return summary;

  const byUser = new Map<string, PushSub[]>();
  for (const s of subs) (byUser.get(s.user_id) ?? byUser.set(s.user_id, []).get(s.user_id)!).push(s);

  const { data: profiles, error: perr } = await admin.from("profiles").select("*").in("user_id", [...byUser.keys()]);
  if (perr) throw new Error(`profiles: ${perr.message}`);

  for (const p of profiles as unknown as Profile[]) {
    if (!p.default_workspace_id) continue;
    summary.users++;
    const userSubs = byUser.get(p.user_id) ?? [];
    const ws = p.default_workspace_id;
    const local = nowLocal(now, p.timezone);
    if (inQuietHours(local.time, p.quiet_hours_start.slice(0, 5), p.quiet_hours_end.slice(0, 5))) { summary.quiet++; continue; }

    // ------- candidatos
    const pushes: Push[] = [];
    const [tasks, events] = await Promise.all([
      admin.from("tasks").select("id,title,due_date,due_time,status,parent_id,updated_at").eq("workspace_id", ws).eq("status", "open").not("due_time", "is", null)
        .gte("due_date", addDays(local.date, -1)).lte("due_date", addDays(local.date, 1)).limit(500),
      admin.from("events").select("id,title,location,all_day,start_date,start_time,end_date,recurrence").eq("workspace_id", ws)
        .lte("start_date", addDays(local.date, 1)).or(`end_date.gte.${local.date},recurrence.not.is.null`).limit(1000),
    ]);
    pushes.push(...planTaskReminders((tasks.data ?? []).map((t) => ({ ...t, updatedLocal: nowLocal(new Date(t.updated_at), p.timezone) })), p, local));
    pushes.push(...planEventReminders(eventOccurrences(events.data ?? [], local.date, addDays(local.date, 1)), p, local));

    // Resumen, atrasadas y revisión: solo se consultan si su ventana horaria aplica.
    const probe = { todayTasks: [{ title: "", due_time: null }], overdueCount: 1, todayEvents: [] };
    const digestDue = planDailyDigest(p, local, probe) !== null;
    const overdueDue = planOverdueAlert(p, local, 1) !== null;
    if (digestDue || overdueDue) {
      const [today, overdue] = await Promise.all([
        admin.from("tasks").select("title,due_time").eq("workspace_id", ws).eq("status", "open").is("parent_id", null).eq("due_date", local.date).order("due_time", { nullsFirst: false }).limit(50),
        admin.from("tasks").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("status", "open").is("parent_id", null).lt("due_date", local.date),
      ]);
      const overdueCount = overdue.count ?? 0;
      const digest = planDailyDigest(p, local, {
        todayTasks: today.data ?? [], overdueCount,
        todayEvents: eventOccurrences(events.data ?? [], local.date, local.date).map((e) => ({ title: e.title, startTime: e.startTime })),
      });
      if (digest) pushes.push(digest);
      const od = planOverdueAlert(p, local, overdueCount);
      if (od) pushes.push(od);
    }
    if (planWeeklyReview(p, local, 1) !== null) {
      const { count } = await admin.from("goals").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("status", "active");
      const weekly = planWeeklyReview(p, local, count ?? 0);
      if (weekly) pushes.push(weekly);
    }

    // Noticias del día: solo se consulta si ya es su hora y el resumen existe.
    const newsProbe = planNewsPush(p, local, { day: local.date, ready: true, notified: false, title: "", body: "", image: null });
    let newsDigestId: string | null = null;
    if (newsProbe) {
      const { data: d } = await admin.from("news_digests").select("id, status, content, notified_at").eq("user_id", p.user_id).eq("workspace_id", ws).eq("day", local.date).maybeSingle();
      const pending = !d || (d.content as { pending?: boolean }).pending === true;
      if (d && !pending) {
        const t = notificationText(d.status as DigestStatus, d.content as unknown as DigestContent);
        const n = planNewsPush(p, local, { day: local.date, ready: true, notified: !!d.notified_at, ...t });
        if (n) { pushes.push(n); newsDigestId = d.id; }
      }
    }

    // Correo nuevo: solo cuentas con el aviso activado, mensajes sin leer de las últimas 2 h aún no avisados.
    const { data: mailAccs } = await admin.from("mail_accounts").select("id, email").eq("user_id", p.user_id).eq("notify_new", true).eq("status", "ok");
    let mailIds: string[] = [];
    if (mailAccs?.length) {
      const { data: fresh } = await admin.from("mail_messages").select("id, account_id, from_name, from_address, subject").in("account_id", mailAccs.map((a) => a.id))
        .eq("is_read", false).is("notified_at", null).gte("received_at", new Date(now.getTime() - 2 * 3600_000).toISOString()).order("received_at", { ascending: false }).limit(20);
      const email = new Map(mailAccs.map((a) => [a.id, a.email]));
      mailIds = (fresh ?? []).map((m) => m.id);
      pushes.push(...planMailPushes((fresh ?? []).map((m) => ({ id: m.id, from: m.from_name || m.from_address, subject: m.subject, account: email.get(m.account_id) ?? "" }))));
    }

    // ------- envío (con reclamación previa)
    const deliver = async (payload: PushPayload): Promise<boolean> => {
      const results = await Promise.all(userSubs.map(async (s) => ({ s, r: await send(s, payload) })));
      const gone = results.filter((x) => !x.r.ok && x.r.gone).map((x) => x.s.id);
      if (gone.length) { await admin.from("push_subscriptions").delete().in("id", gone); summary.removedSubscriptions += gone.length; }
      const okIds = results.filter((x) => x.r.ok).map((x) => x.s.id);
      if (okIds.length) await admin.from("push_subscriptions").update({ last_success_at: now.toISOString() }).in("id", okIds);
      const transientFailure = results.some((x) => !x.r.ok && !x.r.gone);
      return okIds.length > 0 || !transientFailure; // si todo falló por algo temporal, hay que reintentar
    };

    for (const n of pushes) {
      const { data: claimed, error: cerr } = await admin.from("notification_log")
        .upsert({ user_id: p.user_id, dedupe_key: n.key, kind: n.kind }, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id");
      if (cerr || !claimed || claimed.length === 0) continue; // ya enviado (o error: se reintenta en el siguiente minuto)
      const ok = await deliver({ title: n.title, body: n.body, url: n.url, kind: n.kind, refId: n.refId, tag: n.key, image: n.image ?? undefined });
      if (ok && n.kind === "mail" && mailIds.length) { await admin.from("mail_messages").update({ notified_at: now.toISOString() }).in("id", mailIds); mailIds = []; }
      if (ok && n.kind === "news" && newsDigestId) await admin.from("news_digests").update({ notified_at: now.toISOString() }).eq("id", newsDigestId);
      if (ok) summary.sent++;
      else { summary.failed++; await admin.from("notification_log").delete().eq("id", claimed[0].id); }
    }

    // Recordatorios sueltos (tabla reminders): se reclaman cambiando su estado.
    const { data: due } = await admin.from("reminders").select("id,title,remind_at").eq("user_id", p.user_id).in("status", ["pending", "snoozed"])
      .lte("remind_at", now.toISOString()).gte("remind_at", new Date(now.getTime() - 24 * 3600_000).toISOString()).limit(20);
    for (const r of due ?? []) {
      const { data: claimed } = await admin.from("reminders").update({ status: "sent", sent_at: now.toISOString() }).eq("id", r.id).in("status", ["pending", "snoozed"]).select("id");
      if (!claimed?.length) continue;
      const ok = await deliver({ title: "Recordatorio", body: r.title, url: `/aviso/reminder/${r.id}`, kind: "reminder", refId: r.id, tag: `reminder:${r.id}` });
      if (ok) summary.sent++;
      else { summary.failed++; await admin.from("reminders").update({ status: "pending", sent_at: null }).eq("id", r.id); }
    }
  }

  // Limpieza ocasional del registro (una vez por hora).
  if (now.getUTCMinutes() === 0) await admin.from("notification_log").delete().lt("created_at", new Date(now.getTime() - 35 * 86_400_000).toISOString());
  return summary;
}

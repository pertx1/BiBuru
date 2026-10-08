import "server-only";
import { after } from "next/server";
import { addDays, nowLocal } from "@/lib/dates";
import { syncDueMailAccounts } from "@/lib/mail/service";
import { inQuietHours } from "@/lib/notifications/planning";
import { webPushSender, type PushSub } from "@/lib/notifications/push";
import { igProfile, IgError } from "@/lib/social/instagram";
import { socialToken, upsertIgMedia, type SocialAccount } from "@/lib/social/service";
import { isStale, socialAlerts } from "@/lib/social/stats";
import { ttProfile, ttVideos, TtError } from "@/lib/social/tiktok";
import "@/lib/social/tiktok-service"; // registra el token de TikTok en el servicio común
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";

/**
 * Actualización automática, todo de una: por cada cuenta, seguidores y datos de sus publicaciones; y el correo. La lanza el cron cada hora (dentro del de Redes), «Actualizar todo» y abrir Redes si los datos
 * tienen más de 15 min. Idempotente y ligera: si una red pone un límite, esa cuenta se salta hasta la próxima pasada.
 */
const ACC = "id, workspace_id, user_id, platform, external_id, username, access_token_enc, refresh_token_enc, token_expires_at, refresh_expires_at, status, last_snapshot_on, created_at, updated_at, followers_count, last_sync_at, rate_limited_until";
type Row = SocialAccount & { username: string | null; followers_count: number | null; last_sync_at: string | null; rate_limited_until: string | null };

export type SyncResult = { accounts: number; limited: number; errors: number; mail: number };

/** Actualiza una cuenta. Nunca lanza: los fallos quedan en `sync_error` (y en pantalla). */
export async function syncAccount(admin: AdminClient, acc: Row, now = new Date()): Promise<{ limited?: boolean; error?: string }> {
  if (acc.status === "expired") return { error: "conexión caducada" };
  if (acc.rate_limited_until && new Date(acc.rate_limited_until).getTime() > now.getTime()) return { limited: true };
  const token = await socialToken(admin, acc, now);
  if (!token) return { error: "sin token" };
  let followers: number | null = acc.followers_count;
  try {
    if (acc.platform === "instagram") {
      const p = await igProfile(token);
      followers = p.followers;
      await upsertIgMedia(admin, acc, token, now);
    } else {
      const [p, videos] = await Promise.all([ttProfile(token), ttVideos(token, 1)]);
      followers = p.followers;
      if (videos.length) await admin.from("social_media").upsert(videos.map((v) => ({
        workspace_id: acc.workspace_id, account_id: acc.id, external_id: v.id, caption: v.caption, media_type: "VIDEO", permalink: v.url?.startsWith("https://") ? v.url.slice(0, 2000) : null,
        thumbnail_url: v.cover?.startsWith("https://") ? v.cover.slice(0, 4000) : null, posted_at: v.createdAt, views: v.views, likes: v.likes, comments: v.comments, shares: v.shares, interactions: v.likes + v.comments + v.shares,
      })), { onConflict: "account_id,external_id" });
    }
    await admin.from("social_accounts").update({ followers_count: followers, last_sync_at: now.toISOString(), sync_error: null, rate_limited_until: null }).eq("id", acc.id);
    await alertsFor(admin, acc, followers, now).catch(() => null);
    return {};
  } catch (e) {
    const limited = (e instanceof IgError && e.limited) || (e instanceof TtError && e.status === 429);
    const expired = (e instanceof IgError && e.expired) || (e instanceof TtError && e.expired);
    const msg = limited ? "Límite de la red alcanzado: sigo en la próxima pasada" : (e instanceof Error ? e.message : "Error al actualizar").slice(0, 300);
    await admin.from("social_accounts").update({
      sync_error: msg, last_sync_at: now.toISOString(), ...(limited ? { rate_limited_until: new Date(now.getTime() + 60 * 60_000).toISOString() } : {}), ...(expired ? { status: "expired" } : {}),
    }).eq("id", acc.id);
    return { limited, error: msg };
  }
}

/** Avisos opcionales (Ajustes → «Avisos de redes»): cifra redonda, caída brusca y publicación por encima de la media. */
async function alertsFor(admin: AdminClient, acc: Row, followers: number | null, now: Date) {
  const { data: p } = await admin.from("profiles").select("social_alerts_enabled, timezone, quiet_hours_start, quiet_hours_end").eq("user_id", acc.user_id).maybeSingle();
  if (!p?.social_alerts_enabled) return;
  if (inQuietHours(nowLocal(now, p.timezone).time, String(p.quiet_hours_start).slice(0, 5), String(p.quiet_hours_end).slice(0, 5))) return;
  const yesterday = addDays(nowLocal(now, p.timezone).date, -1);
  const [{ data: day }, { data: media }] = await Promise.all([
    admin.from("social_daily").select("followers").eq("account_id", acc.id).lte("day", yesterday).not("followers", "is", null).order("day", { ascending: false }).limit(1).maybeSingle(),
    admin.from("social_media").select("external_id, views, posted_at").eq("account_id", acc.id).order("posted_at", { ascending: false }).limit(20),
  ]);
  const alerts = socialAlerts({ accountId: acc.id, username: acc.username, before: day?.followers ?? null, now: followers, media: (media ?? []).map((m) => ({ id: m.external_id, views: m.views, posted_at: m.posted_at })), at: now });
  if (!alerts.length) return;
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", acc.user_id);
  if (!subs?.length) return;
  let send;
  try { send = webPushSender(); } catch { return; }
  for (const a of alerts) {
    const { data: claimed } = await admin.from("notification_log").upsert({ user_id: acc.user_id, dedupe_key: a.key, kind: "social" }, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id");
    if (!claimed?.length) continue;
    for (const s of subs as PushSub[]) await send(s, { title: a.title, body: a.body, url: "/redes?vista=estadisticas", kind: "social", tag: a.key });
  }
}

/** Cuentas que tocan (más de `staleMinutes` sin actualizar), de la más atrasada a la más reciente. */
export async function syncDue(admin: AdminClient, o: { limit?: number; staleMinutes?: number; ids?: string[]; now?: Date } = {}): Promise<SyncResult> {
  const now = o.now ?? new Date();
  const out: SyncResult = { accounts: 0, limited: 0, errors: 0, mail: 0 };
  let q = admin.from("social_accounts").select(ACC).neq("status", "expired");
  if (o.ids) q = q.in("id", o.ids);
  else q = q.or(`last_sync_at.is.null,last_sync_at.lt.${new Date(now.getTime() - (o.staleMinutes ?? 60) * 60_000).toISOString()}`);
  const { data } = await q.order("last_sync_at", { ascending: true, nullsFirst: true }).limit(o.limit ?? 3);
  for (const acc of (data ?? []) as Row[]) {
    const r = await syncAccount(admin, acc, now);
    out.accounts++;
    if (r.limited) out.limited++; else if (r.error) out.errors++;
  }
  return out;
}

/** «Actualizar todo»: todas las cuentas del espacio y los correos de la persona, ya. */
export async function syncWorkspaceNow(workspaceId: string, userId: string): Promise<SyncResult> {
  const admin = createAdminClient();
  const { data } = await admin.from("social_accounts").select("id").eq("workspace_id", workspaceId).limit(20);
  const r = await syncDue(admin, { ids: (data ?? []).map((a) => a.id), limit: 20 });
  const mail = await syncDueMailAccounts(admin, { userId, staleMinutes: 0, limit: 10 }).catch(() => null);
  return { ...r, mail: mail?.ok ?? 0 };
}

/** Al abrir Redes o la Bandeja: si alguna cuenta lleva más de 15 min sin actualizarse, se refresca en segundo plano. */
export function refreshIfStale(accounts: { id: string; last_sync_at?: string | null; status: string }[]) {
  const stale = accounts.filter((a) => a.status !== "expired" && isStale(a.last_sync_at)).map((a) => a.id);
  if (!stale.length || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try { after(() => syncDue(createAdminClient(), { ids: stale, limit: 5 }).catch(() => null)); } catch { /* fuera de una petición: no hace falta */ }
}

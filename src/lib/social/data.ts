import "server-only";
import { getContext } from "@/lib/context";
import { instagramConfig } from "./instagram";
import { aggregateDaily } from "./stats";

export const socialConfigured = () => ({
  instagram: !!instagramConfig() && !!process.env.TOKEN_ENCRYPTION_KEY,
  tiktok: !!process.env.TIKTOK_CLIENT_KEY?.trim() && !!process.env.TIKTOK_CLIENT_SECRET?.trim() && !!process.env.TOKEN_ENCRYPTION_KEY,
});

const ACC_COLS = "id, platform, username, display_name, avatar_url, business_id, status, last_error, token_expires_at, last_snapshot_on, account_type, scopes, followers_count, last_sync_at, sync_error, rate_limited_until, inbox_synced_at";

/** Cuentas del espacio (o de un negocio). Si la base aún no tiene las columnas nuevas, vuelve a las de antes. */
export async function listSocialAccounts(businessId?: string) {
  const { supabase, workspaceId } = await getContext();
  let q = supabase.from("social_accounts").select(ACC_COLS).eq("workspace_id", workspaceId).order("created_at");
  if (businessId) q = q.eq("business_id", businessId);
  const { data, error } = await q;
  if (!error) return data ?? [];
  let old = supabase.from("social_accounts").select("id, platform, username, display_name, avatar_url, business_id, status, last_error, token_expires_at, last_snapshot_on, account_type, scopes").eq("workspace_id", workspaceId).order("created_at");
  if (businessId) old = old.eq("business_id", businessId);
  const r = await old;
  return (r.data ?? []).map((a) => ({ ...a, followers_count: null, last_sync_at: null, sync_error: null, rate_limited_until: null, inbox_synced_at: null }));
}
export type SocialAccountView = Awaited<ReturnType<typeof listSocialAccounts>>[number];

/** Por cuenta: mensajes sin responder y fotos de seguidores de los últimos 8 días (para «+12 hoy», «+85 esta semana»). */
export async function accountsExtras(ids: string[], since: string) {
  if (!ids.length) return { unread: new Map<string, number>(), daily: [] as { account_id: string; day: string; followers: number | null }[] };
  const { supabase, workspaceId } = await getContext();
  const [threads, daily] = await Promise.all([
    supabase.from("social_threads").select("account_id").eq("workspace_id", workspaceId).eq("status", "sin_responder").in("account_id", ids).limit(5000),
    supabase.from("social_daily").select("account_id, day, followers").eq("workspace_id", workspaceId).in("account_id", ids).gte("day", since).limit(2000),
  ]);
  const unread = new Map<string, number>();
  for (const t of threads.data ?? []) unread.set(t.account_id, (unread.get(t.account_id) ?? 0) + 1);
  return { unread, daily: daily.data ?? [] };
}

/** Estadísticas de una o varias cuentas (varias = suma día a día de todas sus redes). */
export async function accountStats(accountIds: string | string[], from: string, to: string, prevFrom: string) {
  const ids = Array.isArray(accountIds) ? accountIds : [accountIds];
  const { supabase, workspaceId } = await getContext();
  const [daily, media] = await Promise.all([
    supabase.from("social_daily").select("day, followers, reach, views, interactions").eq("workspace_id", workspaceId).in("account_id", ids).gte("day", prevFrom).lte("day", to).order("day").limit(5000),
    supabase.from("social_media").select("id, caption, permalink, thumbnail_url, posted_at, reach, views, interactions, likes, comments").eq("workspace_id", workspaceId).in("account_id", ids).order("posted_at", { ascending: false }).limit(300),
  ]);
  return { daily: aggregateDaily(daily.data ?? []), media: media.data ?? [], from };
}

export async function listPosts(limit = 100) {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase.from("social_posts")
    .select("id, title, caption, hashtags, media_kind, scheduled_at, status, business_id, notes, source_video_id, created_at, social_post_targets(id, account_id, mode, status, error, permalink, privacy, published_at), social_post_files(id, path, mime, size_bytes, position, deleted_at)")
    .eq("workspace_id", workspaceId).order("scheduled_at", { ascending: false, nullsFirst: true }).limit(limit);
  return data ?? [];
}

/** Espacio usado por los archivos aún no borrados (para no pasar del plan gratuito). */
export async function storageUsed() {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase.from("social_post_files").select("size_bytes").eq("workspace_id", workspaceId).is("deleted_at", null).limit(5000);
  return (data ?? []).reduce((s, f) => s + Number(f.size_bytes), 0);
}

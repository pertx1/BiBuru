import "server-only";
import { getContext } from "@/lib/context";
import { instagramConfig } from "./instagram";

export const socialConfigured = () => ({
  instagram: !!instagramConfig() && !!process.env.TOKEN_ENCRYPTION_KEY,
  tiktok: !!process.env.TIKTOK_CLIENT_KEY?.trim() && !!process.env.TIKTOK_CLIENT_SECRET?.trim() && !!process.env.TOKEN_ENCRYPTION_KEY,
});

export async function listSocialAccounts() {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase.from("social_accounts").select("id, platform, username, display_name, avatar_url, business_id, status, last_error, token_expires_at, last_snapshot_on, account_type, scopes").eq("workspace_id", workspaceId).order("created_at");
  return data ?? [];
}

export async function accountStats(accountId: string, from: string, to: string, prevFrom: string) {
  const { supabase, workspaceId } = await getContext();
  const [daily, media] = await Promise.all([
    supabase.from("social_daily").select("day, followers, reach, views, interactions").eq("workspace_id", workspaceId).eq("account_id", accountId).gte("day", prevFrom).lte("day", to).order("day"),
    supabase.from("social_media").select("id, caption, permalink, thumbnail_url, posted_at, reach, views, interactions, likes, comments").eq("workspace_id", workspaceId).eq("account_id", accountId).order("posted_at", { ascending: false }).limit(200),
  ]);
  return { daily: daily.data ?? [], media: media.data ?? [], from };
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

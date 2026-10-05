import "server-only";
import { getModelNames } from "@/lib/ai/gemini";
import { getContext } from "@/lib/context";
import { tagsOf } from "@/lib/notes/data";
import type { Database } from "@/lib/supabase/database.types";
import { estimateVideoCost } from "./service";

export type VideoRow = Database["public"]["Tables"]["saved_videos"]["Row"];
export type VideoCategory = Database["public"]["Tables"]["video_categories"]["Row"];
export type VideoFilters = { estado: string; cat: string; neg: string; q: string; orden: "util" | "fecha" };
export { STATUS_LABELS } from "./labels";

export async function listFavorites(f: VideoFilters) {
  const { supabase, workspaceId } = await getContext();
  let q = supabase.from("saved_videos").select("*").eq("workspace_id", workspaceId);
  if (f.estado !== "todos") q = q.eq("status", f.estado);
  if (f.cat === "none") q = q.is("category_id", null); else if (f.cat) q = q.eq("category_id", f.cat);
  if (f.neg) q = q.eq("business_id", f.neg);
  if (f.q.trim()) {
    const { data: hits } = await supabase.rpc("search_all", { ws: workspaceId, q: f.q, max_rows: 100 });
    const ids = (hits ?? []).filter((h) => h.kind === "video").map((h) => h.id);
    q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  q = f.orden === "util" ? q.order("utility", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }) : q.order("created_at", { ascending: false });
  const { data, error } = await q.limit(200);
  if (error) throw new Error(`favoritos: ${error.message}`);
  const videos = data ?? [];
  const [tags, counts, categories] = await Promise.all([
    tagsOf("video", videos.map((v) => v.id)),
    supabase.from("saved_videos").select("status, category_id").eq("workspace_id", workspaceId).limit(5000),
    supabase.from("video_categories").select("*").eq("workspace_id", workspaceId).order("pinned", { ascending: false }).order("name"),
  ]);
  const byStatus: Record<string, number> = { todos: 0, por_ver: 0, visto: 0, aplicado: 0, archivado: 0 };
  const byCat: Record<string, number> = {};
  for (const r of counts.data ?? []) {
    byStatus.todos++; byStatus[r.status]++;
    if (r.category_id && (f.estado === "todos" || r.status === f.estado)) byCat[r.category_id] = (byCat[r.category_id] ?? 0) + 1;
  }
  // Coste estimado de los vídeos que esperan confirmación (duración larga).
  const models = getModelNames();
  const costs: Record<string, number> = {};
  for (const v of videos.filter((x) => x.analysis_status === "needs_confirm")) costs[v.id] = await estimateVideoCost({ supabase, workspaceId, models }, v.duration_sec);
  return { videos, tags, byStatus, byCat, categories: categories.data ?? [], costs };
}

import "server-only";
import { getContext } from "@/lib/context";
import { ancestors, buildTree, descendantIds, type CatNode } from "@/lib/categories/tree";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Proyectos = las categorías (las de Favoritos) con subcategorías. Cada una reúne sus vídeos, notas y tareas,
 * contando también las de sus subcategorías.
 */
export type Category = Database["public"]["Tables"]["video_categories"]["Row"];
export type Counts = { videos: number; notes: number; tasks: number };

export async function listCategories(): Promise<Category[]> {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase.from("video_categories").select("*").eq("workspace_id", workspaceId).order("pinned", { ascending: false }).order("name");
  return data ?? [];
}

/** Recuento propio de cada categoría (sin subcategorías) de vídeos, notas y tareas abiertas. */
async function ownCounts(): Promise<Map<string, Counts>> {
  const { supabase, workspaceId } = await getContext();
  const [v, n, t] = await Promise.all([
    supabase.from("saved_videos").select("category_id").eq("workspace_id", workspaceId).not("category_id", "is", null).limit(10000),
    supabase.from("notes").select("category_id").eq("workspace_id", workspaceId).not("category_id", "is", null).limit(10000),
    supabase.from("tasks").select("category_id").eq("workspace_id", workspaceId).eq("status", "open").not("category_id", "is", null).limit(10000),
  ]);
  const m = new Map<string, Counts>();
  const add = (rows: { category_id: string | null }[] | null, k: keyof Counts) => { for (const r of rows ?? []) { const c = m.get(r.category_id!) ?? { videos: 0, notes: 0, tasks: 0 }; c[k]++; m.set(r.category_id!, c); } };
  add(v.data, "videos"); add(n.data, "notes"); add(t.data, "tasks");
  return m;
}

const sumCounts = (cats: Category[], own: Map<string, Counts>, id: string): Counts =>
  descendantIds(cats, id).reduce((s, x) => { const c = own.get(x); return c ? { videos: s.videos + c.videos, notes: s.notes + c.notes, tasks: s.tasks + c.tasks } : s; }, { videos: 0, notes: 0, tasks: 0 });

export async function getProjectsOverview(): Promise<{ tree: CatNode<Category>[]; counts: Record<string, Counts> }> {
  const [cats, own] = await Promise.all([listCategories(), ownCounts()]);
  return { tree: buildTree(cats), counts: Object.fromEntries(cats.map((c) => [c.id, sumCounts(cats, own, c.id)])) };
}

export async function getProject(id: string) {
  const { supabase, workspaceId } = await getContext();
  const [cats, own] = await Promise.all([listCategories(), ownCounts()]);
  const cat = cats.find((c) => c.id === id);
  if (!cat) return null;
  const ids = descendantIds(cats, id);
  const node = (function find(nodes: CatNode<Category>[]): CatNode<Category> | null { for (const n of nodes) { if (n.id === id) return n; const f = find(n.children); if (f) return f; } return null; })(buildTree(cats));
  const [videos, notes, tasks, done] = await Promise.all([
    supabase.from("saved_videos").select("id, title, channel, source, thumbnail_url, summary, utility, status, category_id, analysis_status")
      .eq("workspace_id", workspaceId).in("category_id", ids).neq("status", "archivado").order("utility", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(60),
    supabase.from("notes").select("id, title, body, pinned, updated_at, category_id").eq("workspace_id", workspaceId).in("category_id", ids).order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(60),
    supabase.from("tasks").select("id, title, due_date, due_time, priority, category_id").eq("workspace_id", workspaceId).in("category_id", ids).eq("status", "open")
      .order("due_date", { ascending: true, nullsFirst: false }).order("priority", { ascending: false }).limit(100),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("category_id", ids).eq("status", "done"),
  ]);
  return {
    category: cat, trail: ancestors(cats, id), children: node?.children ?? [], all: cats,
    counts: Object.fromEntries((node?.children ?? []).map((c) => [c.id, sumCounts(cats, own, c.id)])) as Record<string, Counts>,
    videos: videos.data ?? [], notes: notes.data ?? [], tasks: tasks.data ?? [], doneTasks: done.count ?? 0,
  };
}

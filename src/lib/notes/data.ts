import "server-only";
import { getContext } from "@/lib/context";
import type { Database } from "@/lib/supabase/database.types";

export type Note = Database["public"]["Tables"]["notes"]["Row"];
export type Folder = Database["public"]["Tables"]["folders"]["Row"];
export type Tag = Database["public"]["Tables"]["tags"]["Row"];
export type InboxItem = Database["public"]["Tables"]["inbox_items"]["Row"];
export type NoteListItem = Pick<Note, "id" | "title" | "pinned" | "folder_id" | "business_id" | "updated_at"> & { preview: string };

function fail(what: string, e: { message: string } | null): never {
  console.error(`[notes] ${what}:`, e?.message);
  throw new Error(`No se pudo cargar: ${what}`);
}

export async function listFolders(): Promise<Folder[]> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("folders").select("*").eq("workspace_id", workspaceId).order("sort_order").order("name");
  if (error) fail("carpetas", error);
  return data;
}

export async function listTags(): Promise<Tag[]> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("tags").select("*").eq("workspace_id", workspaceId).order("name");
  if (error) fail("etiquetas", error);
  return data;
}

export type NoteFilter = { folder?: string | "none"; tag?: string; businessId?: string; limit?: number };

export async function listNotes(f: NoteFilter = {}): Promise<NoteListItem[]> {
  const { supabase, workspaceId } = await getContext();
  let ids: string[] | null = null;
  if (f.tag) {
    const { data, error } = await supabase.from("taggings").select("item_id").eq("workspace_id", workspaceId).eq("tag_id", f.tag).eq("item_type", "note");
    if (error) fail("etiquetas de notas", error);
    ids = data.map((r) => r.item_id);
    if (ids.length === 0) return [];
  }
  let q = supabase.from("notes").select("id,title,pinned,folder_id,business_id,updated_at,body").eq("workspace_id", workspaceId)
    .order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(f.limit ?? 300);
  if (f.folder === "none") q = q.is("folder_id", null);
  else if (f.folder) q = q.eq("folder_id", f.folder);
  if (f.businessId) q = q.eq("business_id", f.businessId);
  if (ids) q = q.in("id", ids);
  const { data, error } = await q;
  if (error) fail("notas", error);
  return data.map(({ body, ...n }) => ({ ...n, preview: body.replace(/[#>*_`~\-\[\]()!]/g, "").replace(/\s+/g, " ").trim().slice(0, 140) }));
}

export async function getNote(id: string): Promise<(Note & { tags: Tag[] }) | null> {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("notes").select("*").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  if (error) fail("nota", error);
  if (!data) return null;
  return { ...data, tags: await tagsOf("note", [id]).then((m) => m.get(id) ?? []) };
}

/** Etiquetas de varios elementos de un mismo tipo. */
export async function tagsOf(itemType: "note" | "task" | "video", itemIds: string[]): Promise<Map<string, Tag[]>> {
  const out = new Map<string, Tag[]>();
  if (itemIds.length === 0) return out;
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("taggings").select("item_id, tags(*)").eq("workspace_id", workspaceId).eq("item_type", itemType).in("item_id", itemIds);
  if (error) fail("etiquetas", error);
  for (const r of data as unknown as { item_id: string; tags: Tag | null }[]) {
    if (!r.tags) continue;
    (out.get(r.item_id) ?? out.set(r.item_id, []).get(r.item_id)!).push(r.tags);
  }
  return out;
}

export async function listInbox(status: "open" | "all" = "open"): Promise<InboxItem[]> {
  const { supabase, workspaceId } = await getContext();
  let q = supabase.from("inbox_items").select("*").eq("workspace_id", workspaceId).order("captured_at", { ascending: false }).limit(200);
  q = status === "open" ? q.in("status", ["pending", "processing", "proposed"]) : q;
  const { data, error } = await q;
  if (error) fail("bandeja", error);
  return data;
}

export async function countInbox(): Promise<number> {
  const { supabase, workspaceId } = await getContext();
  const { count } = await supabase.from("inbox_items").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("status", ["pending", "processing", "proposed"]);
  return count ?? 0;
}

export type SearchHit = { kind: "note" | "task" | "order" | "expense" | "video"; id: string; business_id: string | null; title: string; snippet: string; happened_on: string | null };

export async function searchAll(q: string): Promise<SearchHit[]> {
  const term = q.trim().slice(0, 100);
  if (!term) return [];
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.rpc("search_all", { ws: workspaceId, q: term, max_rows: 30 });
  if (error) fail("búsqueda", error);
  return data.map((r) => ({ kind: r.kind as SearchHit["kind"], id: r.id, business_id: r.business_id, title: r.title, snippet: r.snippet, happened_on: r.happened_on }));
}

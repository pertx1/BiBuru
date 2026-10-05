import { NotesBrowser } from "@/components/notes/notes-browser";
import { PageHeader } from "@/components/layout/page-header";
import { listFolders, listNotes, listTags, tagsOf } from "@/lib/notes/data";
import { getContext } from "@/lib/context";
import { z } from "zod";

export const metadata = { title: "Notas" };

export default async function NotasPage({ searchParams }: { searchParams: Promise<{ carpeta?: string; etiqueta?: string }> }) {
  const sp = await searchParams;
  const folder = sp.carpeta === "none" ? "none" : z.uuid().safeParse(sp.carpeta).success ? sp.carpeta! : "";
  const tag = z.uuid().safeParse(sp.etiqueta).success ? sp.etiqueta! : "";
  const { supabase, workspaceId } = await getContext();
  const [folders, notes, tags, all] = await Promise.all([
    listFolders(), listNotes({ folder: folder || undefined, tag: tag || undefined }), listTags(),
    supabase.from("notes").select("folder_id").eq("workspace_id", workspaceId).limit(5000),
  ]);
  const noteTags = await tagsOf("note", notes.map((n) => n.id));
  const counts: Record<string, number> = { all: all.data?.length ?? 0, none: 0 };
  for (const n of all.data ?? []) { if (n.folder_id) counts[n.folder_id] = (counts[n.folder_id] ?? 0) + 1; else counts.none++; }
  const lite = (t: { id: string; name: string; color: string }) => ({ id: t.id, name: t.name, color: t.color });
  return (
    <>
      <PageHeader title="Notas" subtitle="Ideas, apuntes y documentos en Markdown, en carpetas." />
      <NotesBrowser folders={folders} notes={notes} tags={tags.map(lite)} noteTags={Object.fromEntries([...noteTags].map(([k, v]) => [k, v.map(lite)]))} active={{ folder, tag }} counts={counts} />
    </>
  );
}

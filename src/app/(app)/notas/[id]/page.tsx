import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { NoteEditor } from "@/components/notes/note-editor";
import { listBusinesses } from "@/lib/data";
import { getNote, listFolders, listTags } from "@/lib/notes/data";

export const metadata = { title: "Nota" };

export default async function NotaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const note = await getNote(id);
  if (!note) notFound();
  const [folders, tags, businesses] = await Promise.all([listFolders(), listTags(), listBusinesses()]);
  const lite = (t: { id: string; name: string; color: string }) => ({ id: t.id, name: t.name, color: t.color });
  return (
    <>
      <Link href={note.folder_id ? `/notas?carpeta=${note.folder_id}` : "/notas"} className="mb-3 inline-block text-sm text-muted hover:text-foreground">← Notas</Link>
      <NoteEditor key={note.id} note={note} folders={folders} businesses={businesses.map((b) => ({ id: b.id, name: b.name }))} tags={note.tags.map(lite)} allTags={tags.map(lite)} />
    </>
  );
}

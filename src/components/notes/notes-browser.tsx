"use client";

import { ChevronRight, Folder as FolderIcon, FolderPlus, Inbox, Pencil, Pin, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createNote, deleteFolder, moveFolder, moveNote, saveFolder } from "@/app/(app)/notas/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { Folder, NoteListItem } from "@/lib/notes/data";
import { cn } from "@/lib/utils";
import type { TagLite } from "./tag-picker";

type Active = { folder: string; tag: string };
const NOTE_MIME = "application/x-biburu-note";
const FOLDER_MIME = "application/x-biburu-folder";

function descendants(folders: Folder[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) { grew = false; for (const f of folders) if (f.parent_id && out.has(f.parent_id) && !out.has(f.id)) { out.add(f.id); grew = true; } }
  return out;
}

/** Árbol de carpetas (arrastrar y soltar en escritorio) y lista de notas. */
export function NotesBrowser({ folders, notes, tags, noteTags, active, counts }: {
  folders: Folder[]; notes: NoteListItem[]; tags: TagLite[]; noteTags: Record<string, TagLite[]>; active: Active; counts: Record<string, number>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ parent: string | null } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set(folders.map((f) => f.parent_id).filter((x): x is string => !!x)));

  const href = (folder: string, tag = "") => { const sp = new URLSearchParams(); if (folder) sp.set("carpeta", folder); if (tag) sp.set("etiqueta", tag); const q = sp.toString(); return `/notas${q ? `?${q}` : ""}`; };
  const refresh = () => router.refresh();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); setError(r.ok ? null : (r.error ?? "Error")); refresh(); });

  function onDrop(e: React.DragEvent, target: string | null) {
    e.preventDefault();
    setOver(null);
    const noteId = e.dataTransfer.getData(NOTE_MIME);
    const folderId = e.dataTransfer.getData(FOLDER_MIME);
    if (noteId) run(() => moveNote(noteId, target));
    else if (folderId && folderId !== target) {
      if (target && descendants(folders, folderId).has(target)) { setError("No se puede mover una carpeta dentro de sí misma."); return; }
      run(() => moveFolder(folderId, target));
      if (target) setOpen((o) => new Set(o).add(target));
    }
  }
  const dropProps = (target: string | null, key: string) => ({
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes(NOTE_MIME) || e.dataTransfer.types.includes(FOLDER_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(key); } },
    onDragLeave: () => setOver((o) => (o === key ? null : o)),
    onDrop: (e: React.DragEvent) => onDrop(e, target),
  });

  function remove(f: Folder) {
    const kids = folders.filter((x) => x.parent_id === f.id).map((x) => x.id);
    const mine = notes.filter((n) => n.folder_id === f.id).map((n) => n.id);
    start(async () => {
      const r = await deleteFolder(f.id);
      if (!r.ok) { setError(r.error); return; }
      if (active.folder === f.id) router.push(href(""));
      toast({
        message: `Carpeta «${f.name}» eliminada`, actionLabel: "Deshacer",
        onAction: () => void (async () => {
          await saveFolder({ id: f.id, name: f.name, parent_id: f.parent_id });
          for (const k of kids) await moveFolder(k, f.id);
          for (const n of mine) await moveNote(n, f.id);
          refresh();
        })(),
      });
      refresh();
    });
  }

  function FolderNode({ f, depth }: { f: Folder; depth: number }) {
    const children = folders.filter((x) => x.parent_id === f.id);
    const isOpen = open.has(f.id);
    return (
      <li>
        <div
          draggable onDragStart={(e) => { e.dataTransfer.setData(FOLDER_MIME, f.id); e.dataTransfer.effectAllowed = "move"; }} {...dropProps(f.id, f.id)}
          className={cn("group flex items-center rounded-lg", over === f.id && "bg-accent/15 ring-1 ring-accent", active.folder === f.id && "bg-surface-2")} style={{ paddingLeft: depth * 12 }}
        >
          <button type="button" aria-label={isOpen ? "Contraer" : "Expandir"} onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })}
            className={cn("flex size-9 shrink-0 items-center justify-center text-muted", children.length === 0 && "invisible")}><ChevronRight className={cn("size-4 transition-transform", isOpen && "rotate-90")} aria-hidden /></button>
          {renaming === f.id ? (
            <form className="flex-1" onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get("n") ?? "").trim(); setRenaming(null); if (v && v !== f.name) run(() => saveFolder({ id: f.id, name: v, parent_id: f.parent_id })); }}>
              <Input name="n" defaultValue={f.name} autoFocus maxLength={80} aria-label="Nombre de la carpeta" onBlur={(e) => e.currentTarget.form?.requestSubmit()} className="min-h-11 md:min-h-9" />
            </form>
          ) : (
            <Link href={href(f.id)} className="flex min-h-11 md:min-h-10 min-w-0 flex-1 items-center gap-2 text-sm"><FolderIcon className="size-4 shrink-0 text-muted" aria-hidden /><span className="truncate">{f.name}</span><span className="ml-auto pr-1 text-xs text-muted">{counts[f.id] ?? 0}</span></Link>
          )}
          <span className="flex opacity-0 focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
            <button type="button" aria-label={`Subcarpeta en ${f.name}`} onClick={() => { setAdding({ parent: f.id }); setOpen((o) => new Set(o).add(f.id)); }} className="flex size-9 items-center justify-center text-muted hover:text-foreground"><FolderPlus className="size-3.5" aria-hidden /></button>
            <button type="button" aria-label={`Renombrar ${f.name}`} onClick={() => setRenaming(f.id)} className="flex size-9 items-center justify-center text-muted hover:text-foreground"><Pencil className="size-3.5" aria-hidden /></button>
            <button type="button" aria-label={`Eliminar ${f.name}`} onClick={() => remove(f)} className="flex size-9 items-center justify-center text-muted hover:text-danger"><Trash2 className="size-3.5" aria-hidden /></button>
          </span>
        </div>
        {adding?.parent === f.id && <AddForm parent={f.id} depth={depth + 1} />}
        {isOpen && children.length > 0 && <ul>{children.map((c) => <FolderNode key={c.id} f={c} depth={depth + 1} />)}</ul>}
      </li>
    );
  }

  function AddForm({ parent, depth }: { parent: string | null; depth: number }) {
    return (
      <form style={{ paddingLeft: depth * 12 + 8 }} className="py-1" onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get("n") ?? "").trim(); setAdding(null); if (v) run(() => saveFolder({ name: v, parent_id: parent })); }}>
        <Input name="n" autoFocus placeholder="Nombre de la carpeta" maxLength={80} aria-label="Nueva carpeta" onBlur={(e) => e.currentTarget.form?.requestSubmit()} onKeyDown={(e) => e.key === "Escape" && setAdding(null)} className="min-h-11 md:min-h-9" />
      </form>
    );
  }

  const roots = folders.filter((f) => !f.parent_id);
  const title = active.folder === "none" ? "Sin carpeta" : active.folder ? (folders.find((f) => f.id === active.folder)?.name ?? "Carpeta") : "Todas las notas";

  return (
    <div className="grid gap-5 md:grid-cols-[16rem_1fr]">
      <aside aria-label="Carpetas" className="flex flex-col gap-3">
        <ul className="flex flex-col gap-0.5">
          <li><Link href={href("")} {...dropProps(null, "all")} className={cn("flex min-h-11 md:min-h-10 items-center gap-2 rounded-lg px-3 text-sm", !active.folder && "bg-surface-2", over === "all" && "ring-1 ring-accent")}><Inbox className="size-4 text-muted" aria-hidden /> Todas<span className="ml-auto text-xs text-muted">{counts.all ?? 0}</span></Link></li>
          <li><Link href={href("none")} {...dropProps(null, "none")} className={cn("flex min-h-11 md:min-h-10 items-center gap-2 rounded-lg px-3 text-sm", active.folder === "none" && "bg-surface-2", over === "none" && "ring-1 ring-accent")}><FolderIcon className="size-4 text-muted" aria-hidden /> Sin carpeta<span className="ml-auto text-xs text-muted">{counts.none ?? 0}</span></Link></li>
          {roots.map((f) => <FolderNode key={f.id} f={f} depth={0} />)}
        </ul>
        {adding?.parent === null ? <AddForm parent={null} depth={0} /> : (
          <button type="button" onClick={() => setAdding({ parent: null })} className="flex min-h-11 md:min-h-10 items-center gap-2 rounded-lg px-3 text-left text-sm text-muted hover:bg-surface-2"><FolderPlus className="size-4" aria-hidden /> Nueva carpeta</button>
        )}
        {tags.length > 0 && (
          <div><p className="mb-1 px-3 text-xs font-medium text-muted">Etiquetas</p>
            <div className="flex flex-wrap gap-1.5 px-1">{tags.map((t) => (
              <Link key={t.id} href={href(active.folder, active.tag === t.id ? "" : t.id)} aria-pressed={active.tag === t.id} className={cn("flex min-h-11 md:min-h-9 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs", active.tag === t.id ? "border-accent bg-accent/10" : "bg-surface")}>
                <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />{t.name}</Link>))}</div>
          </div>
        )}
      </aside>

      <section aria-label="Notas">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button onClick={() => start(async () => { const r = await createNote(active.folder && active.folder !== "none" ? active.folder : null); if (r.ok && r.id) router.push(`/notas/${r.id}`); })}><Plus className="size-4" aria-hidden /> Nueva nota</Button>
        </div>
        {error && <p role="alert" className="mb-2 text-sm text-danger">{error}</p>}
        {notes.length === 0 ? <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">No hay notas aquí. Pulsa «Nueva nota» o arrastra una desde otra carpeta.</p> : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {notes.map((n) => (
              <li key={n.id} draggable onDragStart={(e) => { e.dataTransfer.setData(NOTE_MIME, n.id); e.dataTransfer.effectAllowed = "move"; }}>
                <Link href={`/notas/${n.id}`} className="flex min-h-16 flex-col justify-center gap-0.5 px-4 py-2 hover:bg-surface-2">
                  <span className="flex items-center gap-2 text-sm font-medium">{n.pinned && <Pin className="size-3.5 shrink-0 text-accent" aria-label="Fijada" />}<span className="truncate">{n.title || "Sin título"}</span></span>
                  {n.preview && <span className="truncate text-xs text-muted">{n.preview}</span>}
                  {(noteTags[n.id]?.length ?? 0) > 0 && <span className="mt-0.5 flex flex-wrap gap-1.5">{noteTags[n.id].map((t) => <span key={t.id} className="flex items-center gap-1 text-[11px] text-muted"><span className="size-1.5 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />{t.name}</span>)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 hidden text-xs text-muted md:block">Arrastra notas o carpetas sobre una carpeta para moverlas.</p>
      </section>
    </div>
  );
}

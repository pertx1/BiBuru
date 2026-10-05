"use client";

import { Bold, Check, CheckSquare, Eye, Heading2, Italic, Link2, List, Pencil, Pin, PinOff, Quote, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { deleteNote, moveNote, saveNote, setNotePinned } from "@/app/(app)/notas/actions";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { Folder, Note } from "@/lib/notes/data";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";
import { TagPicker, type TagLite } from "./tag-picker";

type Biz = { id: string; name: string };
type SaveState = "saved" | "saving" | "dirty" | "offline";
const draftKey = (id: string) => `biburu-note-draft:${id}`;

function folderOptions(folders: Folder[]) {
  const out: { id: string; label: string }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of folders.filter((x) => x.parent_id === parent)) { out.push({ id: f.id, label: `${"— ".repeat(depth)}${f.name}` }); walk(f.id, depth + 1); }
  };
  walk(null, 0);
  return out;
}

/** Editor de Markdown cómodo en móvil: barra de formato, vista previa y autoguardado (con copia local por si no hay red). */
export function NoteEditor({ note, folders, businesses, tags, allTags }: { note: Note; folders: Folder[]; businesses: Biz[]; tags: TagLite[]; allTags: TagLite[] }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [pinned, setPinned] = useState(note.pinned);
  const [folderId, setFolderId] = useState(note.folder_id ?? "");
  const [businessId, setBusinessId] = useState(note.business_id ?? "");
  const [preview, setPreview] = useState(false);
  const [state, setState] = useState<SaveState>("saved");
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef({ title, body, folderId, businessId, pinned });
  useEffect(() => { latest.current = { title, body, folderId, businessId, pinned }; });

  const persist = useCallback(async () => {
    const v = latest.current;
    setState("saving");
    try { localStorage.setItem(draftKey(note.id), JSON.stringify({ ...v, at: Date.now() })); } catch { /* sin almacenamiento */ }
    try {
      const r = await saveNote({ id: note.id, title: v.title, body: v.body, pinned: v.pinned, folder_id: v.folderId || null, business_id: v.businessId || null });
      if (r.ok) { setState("saved"); try { localStorage.removeItem(draftKey(note.id)); } catch { /* ok */ } }
      else setState("dirty");
    } catch {
      setState("offline"); // sin red: queda la copia local y se reintenta
    }
  }, [note.id]);

  const schedule = useCallback(() => {
    setState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(), 700);
  }, [persist]);

  useEffect(() => {
    // Recupera una copia local más reciente que la del servidor (cierre sin red, etc.).
    try {
      const raw = localStorage.getItem(draftKey(note.id));
      if (raw) {
        const d = JSON.parse(raw) as { title: string; body: string; at: number };
        if (d.at > Date.parse(note.updated_at) && (d.body !== note.body || d.title !== note.title)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setTitle(d.title); setBody(d.body); setState("dirty");
          toast({ message: "Recuperado el borrador que no se llegó a guardar" });
          setTimeout(() => void persist(), 300);
        }
      }
    } catch { /* ignora */ }
    const flush = () => { if (document.visibilityState === "hidden") { clearTimeout(timer.current); void persist(); } };
    const online = () => void persist();
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("online", online);
    return () => { document.removeEventListener("visibilitychange", flush); window.removeEventListener("online", online); clearTimeout(timer.current); };
  }, [note.id, note.updated_at, note.body, note.title, persist, toast]);

  /** Aplica formato al texto seleccionado conservando, si se puede, el deshacer nativo. */
  function format(before: string, after = before, placeholder = "texto") {
    const el = area.current;
    if (!el) return;
    el.focus();
    const { selectionStart: s, selectionEnd: e, value } = el;
    const sel = value.slice(s, e) || placeholder;
    const lineStart = before.endsWith(" ") && !after ? value.lastIndexOf("\n", s - 1) + 1 : s;
    const text = after === "" ? before : `${before}${sel}${after}`;
    el.setSelectionRange(lineStart, after === "" ? lineStart : e);
    if (!document.execCommand("insertText", false, after === "" ? before : text)) {
      setBody(value.slice(0, lineStart) + (after === "" ? before : text) + value.slice(after === "" ? lineStart : e));
    } else setBody(el.value);
    schedule();
  }

  const tools: { icon: typeof Bold; label: string; args: [string, string?, string?] }[] = [
    { icon: Bold, label: "Negrita", args: ["**"] },
    { icon: Italic, label: "Cursiva", args: ["*"] },
    { icon: Heading2, label: "Encabezado", args: ["## ", ""] },
    { icon: List, label: "Lista", args: ["- ", ""] },
    { icon: CheckSquare, label: "Lista de tareas", args: ["- [ ] ", ""] },
    { icon: Quote, label: "Cita", args: ["> ", ""] },
    { icon: Link2, label: "Enlace", args: ["[", "](https://)", "texto del enlace"] },
  ];

  function remove() {
    const snap = { id: note.id, title, body, pinned, folder_id: folderId || null, business_id: businessId || null };
    void deleteNote(note.id).then(() => {
      router.push("/notas");
      toast({ message: "Nota eliminada", actionLabel: "Deshacer", onAction: () => void saveNote(snap).then(() => router.refresh()) });
    });
  }

  const status = { saved: ["Guardado", "text-muted"], saving: ["Guardando…", "text-muted"], dirty: ["Sin guardar", "text-amber-600"], offline: ["Sin conexión · guardado en el dispositivo", "text-amber-600"] }[state];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input value={title} onChange={(e) => { setTitle(e.target.value); schedule(); }} placeholder="Título" aria-label="Título" maxLength={200}
          className="min-h-12 min-w-0 flex-1 bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted" />
        <button type="button" aria-label={pinned ? "Quitar fijado" : "Fijar nota"} aria-pressed={pinned}
          onClick={() => { const v = !pinned; setPinned(v); void setNotePinned(note.id, v); }} className="flex size-11 items-center justify-center rounded-lg border border-border bg-surface hover:bg-surface-2">
          {pinned ? <Pin className="size-4 text-accent" aria-hidden /> : <PinOff className="size-4" aria-hidden />}
        </button>
      </div>
      <p className={cn("flex items-center gap-1 text-xs", status[1])} aria-live="polite">{state === "saved" && <Check className="size-3.5" aria-hidden />}{status[0]}</p>

      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-1 overflow-x-auto border-b border-border bg-background/95 px-4 py-1 backdrop-blur md:mx-0 md:px-0">
        {!preview && tools.map(({ icon: Icon, label, args }) => (
          // eslint-disable-next-line react-hooks/refs -- el manejador solo lee la referencia al pulsar, no al renderizar
          <button key={label} type="button" aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={() => format(...args)} className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-surface-2 md:size-9"><Icon className="size-4" aria-hidden /></button>
        ))}
        <span className="flex-1" />
        <button type="button" onClick={() => setPreview((p) => !p)} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm hover:bg-surface-2 md:min-h-9">
          {preview ? <><Pencil className="size-4" aria-hidden /> Escribir</> : <><Eye className="size-4" aria-hidden /> Vista previa</>}
        </button>
      </div>

      {preview ? <div className="min-h-[50dvh]"><Markdown>{body}</Markdown></div> : (
        <textarea ref={area} value={body} onChange={(e) => { setBody(e.target.value); schedule(); }} placeholder="Escribe en Markdown: **negrita**, - listas, - [ ] tareas…" aria-label="Contenido de la nota"
          className="min-h-[50dvh] w-full resize-y rounded-xl border border-border bg-surface p-3 font-mono text-base leading-relaxed outline-none focus:border-accent md:text-sm" />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">Carpeta
          <Select value={folderId} onChange={(e) => { setFolderId(e.target.value); void moveNote(note.id, e.target.value || null); }}>
            <option value="">Sin carpeta</option>{folderOptions(folders).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">Negocio
          <Select value={businessId} onChange={(e) => { setBusinessId(e.target.value); schedule(); }}>
            <option value="">Ninguno</option>{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </label>
      </div>
      <div><p className="mb-1 text-xs text-muted">Etiquetas</p><TagPicker itemType="note" itemId={note.id} tags={tags} all={allTags} /></div>
      <div><button type="button" onClick={remove} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-danger"><Trash2 className="size-4" aria-hidden /> Eliminar nota</button></div>
    </div>
  );
}

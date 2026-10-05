"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";
import { addTag, removeTag } from "@/app/(app)/notas/actions";

export type TagLite = { id: string; name: string; color: string };

/** Etiquetas de un elemento: chips con botón de quitar y un campo para añadir (crea la etiqueta si no existe). */
export function TagPicker({ itemType, itemId, tags, all, onChange }: {
  itemType: "note" | "task" | "video"; itemId: string; tags: TagLite[]; all: TagLite[]; onChange?: (t: TagLite[]) => void;
}) {
  const [list, setList] = useState(tags);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const update = (t: TagLite[]) => { setList(t); onChange?.(t); };

  function add(name: string) {
    const n = name.trim().replace(/^#/, "");
    if (!n || list.some((t) => t.name.toLowerCase() === n.toLowerCase())) { setText(""); return; }
    setText("");
    start(async () => {
      const r = await addTag(itemType, itemId, n);
      if (r.ok && r.tag) update([...list, { id: r.tag.id, name: r.tag.name, color: r.tag.color }]);
      else if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-1.5">
        {list.map((t) => (
          <li key={t.id} className="flex items-center gap-1 rounded-full border border-border py-0.5 pl-2.5 pr-1 text-xs">
            <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />{t.name}
            <button type="button" aria-label={`Quitar etiqueta ${t.name}`} className="flex size-7 items-center justify-center text-muted hover:text-danger"
              onClick={() => { update(list.filter((x) => x.id !== t.id)); start(async () => { await removeTag(itemType, itemId, t.id); }); }}><X className="size-3.5" aria-hidden /></button>
          </li>
        ))}
      </ul>
      <input
        list={`tags-${itemId}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Añadir etiqueta…" aria-label="Añadir etiqueta" maxLength={40} disabled={pending}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(text); } }}
        onBlur={() => text.trim() && add(text)}
        className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base md:min-h-9 md:text-sm"
      />
      <datalist id={`tags-${itemId}`}>{all.filter((t) => !list.some((x) => x.id === t.id)).map((t) => <option key={t.id} value={t.name} />)}</datalist>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

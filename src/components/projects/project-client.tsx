"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCategory } from "@/app/(app)/favoritos/actions";
import { addProjectNote, addProjectTask, saveProjectDescription } from "@/app/(app)/proyectos/actions";
import { CategoryOptions } from "@/components/categories/category-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { CatRow } from "@/lib/categories/tree";

/** Crear categoría/proyecto (arriba del todo o dentro de otra). */
export function NewCategory({ categories, parentId, compact }: { categories: CatRow[]; parentId?: string; compact?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [parent, setParent] = useState(parentId ?? "");
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; start(async () => { const r = await createCategory(name, parent || null); toast({ message: r.ok ? "Creada" : (r.error ?? "No se pudo") }); if (r.ok) { setName(""); router.refresh(); } }); }}>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={parentId ? "Nueva subcategoría" : "Nueva categoría o proyecto"} aria-label={parentId ? "Nueva subcategoría" : "Nueva categoría"} maxLength={60} className={compact ? "min-w-0 flex-1" : "min-w-0 basis-full sm:basis-0 sm:flex-1"} />
      {!compact && (
        <select value={parent} onChange={(e) => setParent(e.target.value)} aria-label="Dentro de" className="min-h-11 min-w-0 flex-1 rounded-lg bg-fill px-2 text-base sm:flex-none md:min-h-9 md:text-sm">
          <option value="">Arriba del todo</option><CategoryOptions categories={categories} />
        </select>
      )}
      <Button type="submit" disabled={pending || !name.trim()}><Plus className="size-4" aria-hidden /> Crear</Button>
    </form>
  );
}

/** Tarea rápida dentro del proyecto. */
export function QuickProjectTask({ categoryId }: { categoryId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; start(async () => { const r = await addProjectTask(categoryId, title); if (!r.ok) toast({ message: r.error ?? "No se pudo" }); else { setTitle(""); router.refresh(); } }); }}>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Añadir tarea…" aria-label="Nueva tarea del proyecto" maxLength={300} className="min-w-0 flex-1" />
      <Button type="submit" variant="secondary" disabled={pending || !title.trim()}>Añadir</Button>
    </form>
  );
}

/** Nota nueva dentro del proyecto: se crea y se abre para escribir. */
export function NewProjectNote({ categoryId }: { categoryId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button type="button" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await addProjectNote(categoryId); if (!r.ok) toast({ message: r.error }); else if (r.id) router.push(`/notas/${r.id}`); })}>
      <Plus className="size-4" aria-hidden /> Nueva nota
    </Button>
  );
}

/** Descripción editable («de qué va, en qué punto está»): se guarda al salir del campo. */
export function ProjectDescription({ categoryId, initial }: { categoryId: string; initial: string | null }) {
  const toast = useToast();
  const [value, setValue] = useState(initial ?? "");
  return (
    <textarea value={value} onChange={(e) => setValue(e.target.value)} maxLength={500} rows={2} aria-label="Descripción del proyecto"
      placeholder="¿De qué va? ¿En qué punto está? ¿Qué es lo siguiente?"
      onBlur={() => { if (value !== (initial ?? "")) void saveProjectDescription(categoryId, value).then((r) => { if (!r.ok) toast({ message: r.error ?? "No se pudo guardar" }); }); }}
      className="w-full resize-y rounded-lg bg-fill p-3 text-base outline-none md:text-sm" />
  );
}

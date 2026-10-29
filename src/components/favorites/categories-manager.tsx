"use client";

import { FolderKanban, Pin, PinOff, Settings2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCategory, mergeCategories, moveCategory, renameCategory, togglePinCategory } from "@/app/(app)/favoritos/actions";
import { CategoryOptions } from "@/components/categories/category-options";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { VideoCategory } from "@/lib/favorites/data";
import { buildTree, descendantIds, flatten } from "@/lib/categories/tree";

/** Crear (también dentro de otra), renombrar, mover, fijar (la IA las prefiere) y fusionar categorías. */
export function CategoriesManager({ categories, counts }: { categories: VideoCategory[]; counts: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => start(async () => { const r = await fn(); if (!r.ok) toast({ message: r.error ?? "No se pudo" }); else { if (ok) toast({ message: ok }); router.refresh(); } });
  const flat = flatten(buildTree(categories));
  const field = "min-h-11 rounded-lg border border-border bg-surface px-2 text-base md:min-h-9 md:text-sm";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 md:min-h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm hover:bg-surface-2"><Settings2 className="size-4" aria-hidden /> Categorías</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Categorías">
        <div className="flex flex-col gap-3 text-sm">
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { run(() => createCategory(name, parent || null), "Categoría creada"); setName(""); } }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva categoría" aria-label="Nueva categoría" maxLength={60} className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-base md:min-h-9 md:text-sm" />
            <select value={parent} onChange={(e) => setParent(e.target.value)} aria-label="Dentro de" className={field}>
              <option value="">Arriba del todo</option><CategoryOptions categories={categories} />
            </select>
            <Button type="submit" disabled={pending || !name.trim()}>Crear</Button>
          </form>
          {categories.length === 0 && <p className="text-muted">Todavía no hay categorías: la IA las creará al analizar los vídeos.</p>}
          <ul className="flex flex-col gap-2">
            {flat.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2" style={{ marginLeft: `${Math.min(c.depth, 4) * 16}px` }}>
                <input defaultValue={c.name} aria-label={`Nombre de ${c.path}`} maxLength={60} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && run(() => renameCategory(c.id, e.target.value), "Renombrada")}
                  className="min-h-11 min-w-0 flex-1 rounded-md bg-transparent px-2 text-base md:min-h-9 md:text-sm" />
                <span className="text-xs text-muted">{counts[c.id] ?? 0}</span>
                <button type="button" aria-label={c.pinned ? `Dejar de fijar ${c.path}` : `Fijar ${c.path}`} aria-pressed={c.pinned} onClick={() => run(() => togglePinCategory(c.id, !c.pinned))} className="flex size-11 items-center justify-center rounded-lg hover:bg-surface-2 md:size-9">
                  {c.pinned ? <Pin className="size-4 text-accent" aria-hidden /> : <PinOff className="size-4" aria-hidden />}
                </button>
                <select aria-label={`Mover ${c.path} dentro de…`} value={c.parent_id ?? ""} onChange={(e) => run(() => moveCategory(c.id, e.target.value || null), "Movida")} className={field}>
                  <option value="">Arriba del todo</option><CategoryOptions categories={categories} exclude={descendantIds(categories, c.id)} />
                </select>
                {categories.length > 1 && (
                  <select aria-label={`Fusionar ${c.path} en…`} value="" onChange={(e) => { const to = e.target.value; if (to && confirm(`¿Fusionar «${c.path}» dentro de otra categoría? Sus vídeos, notas y tareas se mueven, sus subcategorías pasan a la otra y esta se borra.`)) run(() => mergeCategories(c.id, to), "Fusionadas"); }} className={field}>
                    <option value="">Fusionar en…</option><CategoryOptions categories={categories} exclude={descendantIds(categories, c.id)} />
                  </select>
                )}
                <Link href={`/proyectos/${c.id}`} className="inline-flex min-h-11 items-center gap-1 px-2 text-xs text-accent md:min-h-9" onClick={() => setOpen(false)}><FolderKanban className="size-3.5" aria-hidden /> Abrir</Link>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Las fijadas (📌) salen primero y la IA las prefiere al clasificar. Cada categoría es también un proyecto en «Proyectos», con sus vídeos, notas y tareas.</p>
        </div>
      </Sheet>
    </>
  );
}

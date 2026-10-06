"use client";

import { Pin, PinOff, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCategory, mergeCategories, renameCategory, togglePinCategory } from "@/app/(app)/favoritos/actions";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { VideoCategory } from "@/lib/favorites/data";

/** Renombrar, fijar (la IA las reutiliza), fusionar y crear categorías. */
export function CategoriesManager({ categories, counts }: { categories: VideoCategory[]; counts: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => start(async () => { const r = await fn(); if (!r.ok) toast({ message: r.error ?? "No se pudo" }); else { if (ok) toast({ message: ok }); router.refresh(); } });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 md:min-h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm hover:bg-surface-2"><Settings2 className="size-4" aria-hidden /> Categorías</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Categorías de vídeos">
        <div className="flex flex-col gap-3 text-sm">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { run(() => createCategory(name), "Categoría creada"); setName(""); } }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva categoría" aria-label="Nueva categoría" maxLength={60} className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-base md:min-h-9 md:text-sm" />
            <Button type="submit" disabled={pending || !name.trim()}>Crear</Button>
          </form>
          {categories.length === 0 && <p className="text-muted">Todavía no hay categorías: la IA las creará al analizar los vídeos.</p>}
          <ul className="flex flex-col gap-2">
            {categories.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
                <input defaultValue={c.name} aria-label={`Nombre de ${c.name}`} maxLength={60} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && run(() => renameCategory(c.id, e.target.value), "Renombrada")}
                  className="min-h-11 min-w-0 flex-1 rounded-md bg-transparent px-2 text-base md:min-h-9 md:text-sm" />
                <span className="text-xs text-muted">{counts[c.id] ?? 0}</span>
                <button type="button" aria-label={c.pinned ? `Dejar de fijar ${c.name}` : `Fijar ${c.name}`} aria-pressed={c.pinned} onClick={() => run(() => togglePinCategory(c.id, !c.pinned))} className="flex size-11 items-center justify-center rounded-lg hover:bg-surface-2 md:size-9">
                  {c.pinned ? <Pin className="size-4 text-accent" aria-hidden /> : <PinOff className="size-4" aria-hidden />}
                </button>
                {categories.length > 1 && (
                  <select aria-label={`Fusionar ${c.name} en…`} value="" onChange={(e) => { const to = e.target.value; if (to && confirm(`¿Fusionar «${c.name}» dentro de otra categoría? Sus vídeos se mueven y esta se borra.`)) run(() => mergeCategories(c.id, to), "Fusionadas"); }} className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base md:min-h-9 md:text-sm">
                    <option value="">Fusionar en…</option>{categories.filter((o) => o.id !== c.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Las categorías fijadas (📌) salen primero y la IA las prefiere al clasificar.</p>
        </div>
      </Sheet>
    </>
  );
}

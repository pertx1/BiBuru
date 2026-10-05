"use client";

import { Tags, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteCategory, saveCategory } from "@/app/(app)/negocios/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { Category } from "@/lib/data";

/** Categorías de gasto editables (renombrar, color, borrar con "Deshacer"). */
export function CategoriesManager({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Error");
      else setError(null);
      router.refresh();
    });

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><Tags className="size-4" aria-hidden /> Categorías</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Categorías de gasto">
        <ul className="flex flex-col gap-2">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <input type="color" aria-label={`Color de ${c.name}`} defaultValue={c.color} className="size-10 shrink-0 rounded-lg border border-border bg-surface p-1"
                onBlur={(e) => e.target.value !== c.color && run(() => saveCategory({ id: c.id, name: c.name, color: e.target.value }))} />
              <Input aria-label="Nombre de la categoría" defaultValue={c.name} maxLength={60}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) run(() => saveCategory({ id: c.id, name: v, color: c.color })); }} />
              <button type="button" aria-label={`Eliminar ${c.name}`} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:text-danger md:size-9"
                onClick={() => { run(() => deleteCategory(c.id)); toast({ message: `Categoría «${c.name}» eliminada`, actionLabel: "Deshacer", onAction: () => run(() => saveCategory({ name: c.name, color: c.color })) }); }}>
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <form className="flex gap-2" action={(fd) => { const n = String(fd.get("name") ?? "").trim(); if (n) run(() => saveCategory({ name: n, color: "#64748b" })); }}>
          <Input name="name" placeholder="Nueva categoría" maxLength={60} aria-label="Nueva categoría" />
          <Button type="submit">Añadir</Button>
        </form>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <p className="text-xs text-muted">Al eliminar una categoría, sus gastos pasan a «Sin categoría».</p>
      </Sheet>
    </>
  );
}

"use client";

import { Mic, Plus } from "lucide-react";
import { useCapture } from "./capture-provider";

/** Barra de captura de Inicio: un toque y a escribir (o dictar desde el panel). */
export function HomeCapture() {
  const { open } = useCapture();
  return (
    <button type="button" onClick={open} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 text-left text-muted shadow-sm hover:bg-surface-2">
      <Plus className="size-5 text-accent" aria-hidden />
      <span className="flex-1 text-base">Apunta una idea, tarea, gasto, enlace…</span>
      <Mic className="size-5" aria-hidden />
    </button>
  );
}

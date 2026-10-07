"use client";

import { ClipboardPaste, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addVideos } from "@/app/(app)/favoritos/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * «Pegar enlace»: siempre visible. Acepta uno o varios enlaces (YouTube, TikTok, también los cortos vm.tiktok.com),
 * se guardan al instante y se analizan solos. El botón «Pegar» lee el portapapeles (el móvil pide permiso la primera vez).
 */
export function AddVideoForm() {
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const save = (value: string) => start(async () => {
    const r = await addVideos(value, note);
    if (!r.ok) { toast({ message: r.error }); return; }
    setText(""); setNote(""); setShowNote(false);
    const parts = [
      r.added && `${r.added} ${r.added === 1 ? "guardado" : "guardados"} ✔ (se analiza${r.added === 1 ? "" : "n"} solo${r.added === 1 ? "" : "s"})`,
      r.duplicates && `${r.duplicates} ya ${r.duplicates === 1 ? "estaba" : "estaban"}`,
      r.unavailable && `${r.unavailable} no disponible${r.unavailable === 1 ? "" : "s"} (privado o borrado)`,
      r.invalid && `${r.invalid} no válido${r.invalid === 1 ? "" : "s"}`,
    ].filter(Boolean);
    toast({ message: parts.join(" · ") || "Nada nuevo" });
    router.refresh();
  });

  async function paste() {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) { toast({ message: "El portapapeles está vacío" }); return; }
      setText(clip);
      if (/https?:\/\//i.test(clip)) save(clip);
    } catch {
      toast({ message: "No se pudo leer el portapapeles: mantén pulsado el campo y elige «Pegar»." });
    }
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) save(text); }}>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-3 size-4 text-muted" aria-hidden />
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} inputMode="url" placeholder="Pegar enlace (TikTok, YouTube…; varios a la vez)" aria-label="Pegar enlace"
            onPaste={(e) => { const t = e.clipboardData.getData("text"); if (/https?:\/\//i.test(t) && !text.trim() && !showNote) { e.preventDefault(); setText(t); save(t); } }}
            className="min-h-11 w-full resize-none rounded-lg border border-border bg-surface py-2.5 pl-9 pr-3 text-base outline-none focus:border-accent md:min-h-9 md:py-1.5 md:text-sm" />
        </div>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => void paste()} className="shrink-0"><ClipboardPaste className="size-4" aria-hidden /> Pegar</Button>
        {text.trim() && <Button type="submit" disabled={pending} className="shrink-0">{pending ? "Guardando…" : "Guardar"}</Button>}
      </div>
      {showNote ? (
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={5000} placeholder="Tu nota (la IA la tendrá en cuenta)" aria-label="Nota para el análisis"
          className="w-full rounded-lg border border-border bg-surface p-2 text-base outline-none focus:border-accent md:text-sm" />
      ) : (
        <button type="button" onClick={() => setShowNote(true)} className="inline-flex min-h-11 items-center self-start text-xs text-muted hover:text-foreground md:min-h-8">+ Añadir una nota antes de guardar</button>
      )}
    </form>
  );
}

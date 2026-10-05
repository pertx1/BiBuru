"use client";

import { Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addVideo } from "@/app/(app)/favoritos/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Pega un enlace (YouTube, TikTok…) y se guarda al instante; el resumen llega unos segundos después. */
export function AddVideoForm() {
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!url.trim()) return;
        start(async () => {
          const r = await addVideo(url);
          if (!r.ok) { toast({ message: r.error }); return; }
          setUrl("");
          toast({ message: r.duplicate ? "Ese vídeo ya estaba guardado" : "Guardado en Favoritos ✔ (se analiza en segundo plano)" });
          router.refresh();
        });
      }}
    >
      <div className="relative min-w-0 flex-1">
        <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" inputMode="url" placeholder="Pega un enlace de vídeo" aria-label="Enlace del vídeo"
          className="min-h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-base outline-none focus:border-accent md:min-h-9 md:text-sm" />
      </div>
      <Button type="submit" disabled={pending || !url.trim()}>{pending ? "Guardando…" : "Guardar"}</Button>
    </form>
  );
}

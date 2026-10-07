"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createVideoUpload, estimateFullAnalysis, startFullAnalysis } from "@/app/(app)/favoritos/actions";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 3 });

/** Duración del vídeo leída en el propio móvil (sin subirlo) para estimar el coste antes. */
function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 60); };
    el.onerror = () => { URL.revokeObjectURL(url); resolve(60); };
    el.src = url;
  });
}

/**
 * «Subir el vídeo»: análisis completo con el archivo guardado desde TikTok (la app nunca lo descarga de TikTok).
 * Enseña el coste estimado y el presupuesto que queda; el archivo se borra en cuanto termina el análisis.
 */
export function UploadFull({ videoId }: { videoId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ f: File; duration: number; cost: number; remaining: number; fits: boolean } | null>(null);
  const [state, setState] = useState<"idle" | "estimating" | "uploading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function pick(f: File | undefined) {
    if (!f) return;
    setError(null); setState("estimating");
    const duration = await readDuration(f);
    const r = await estimateFullAnalysis(videoId, duration);
    setState("idle");
    if (!r.ok) return setError(r.error);
    setFile({ f, duration, cost: r.costEur, remaining: r.remainingEur, fits: r.fits });
  }

  async function upload() {
    if (!file) return;
    setState("uploading"); setError(null);
    const mime = file.f.type || "video/mp4";
    const prep = await createVideoUpload(videoId, { size: file.f.size, mime, durationSec: file.duration });
    if (!prep.ok) { setState("idle"); return setError(prep.error); }
    const up = await createClient().storage.from("video-uploads").uploadToSignedUrl(prep.path, prep.token, file.f, { contentType: mime });
    if (up.error) { setState("idle"); return setError("No se pudo subir el vídeo. Prueba con conexión wifi."); }
    const st = await startFullAnalysis(videoId, prep.path);
    if (!st.ok) { setState("idle"); return setError(st.error); }
    setState("done"); setFile(null);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-border p-3">
      <h4 className="font-semibold">Análisis completo (opcional)</h4>
      <p className="mt-1 text-xs text-muted">Sube el vídeo que guardaste desde TikTok (Compartir → Guardar vídeo). La IA verá lo que se ve y se dice. El archivo se borra al terminar. Máx. 50 MB.</p>
      <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,video/*" className="sr-only" aria-label="Archivo de vídeo" onChange={(e) => void pick(e.target.files?.[0])} />
      {state === "done" ? <p className="mt-2 text-good">Subido ✔ Se está analizando; tarda un par de minutos.</p> : file ? (
        <div className="mt-2 flex flex-col gap-2">
          <p>{file.f.name} · {(file.f.size / 1024 / 1024).toFixed(1)} MB · {Math.round(file.duration)} s</p>
          <p>Coste estimado: <strong>{eur(file.cost)}</strong> · te quedan {eur(file.remaining)} este mes.</p>
          {!file.fits && <p className="text-danger">No queda presupuesto suficiente este mes. Puedes subir el límite en Ajustes → IA.</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={!file.fits || state === "uploading"} onClick={() => void upload()}>{state === "uploading" ? "Subiendo…" : "Subir y analizar"}</Button>
            <Button variant="secondary" disabled={state === "uploading"} onClick={() => setFile(null)}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <Button className="mt-2" variant="secondary" disabled={state !== "idle"} onClick={() => input.current?.click()}><Upload className="size-4" aria-hidden /> {state === "estimating" ? "Calculando coste…" : "Subir el vídeo"}</Button>
      )}
      {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
    </section>
  );
}

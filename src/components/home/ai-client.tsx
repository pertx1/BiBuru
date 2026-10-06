"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp, RefreshCw, Sparkles } from "lucide-react";
import { generateHomeAiNote } from "@/app/(app)/home-actions";

/** Campo para preguntar al asistente: abre el chat con la pregunta ya enviada. */
export function AiAskForm() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form className="flex items-center gap-2 rounded-full border border-border bg-background p-1 pl-4" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/chat?q=${encodeURIComponent(q.trim().slice(0, 1000))}`); }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="¿Cuánto vendí esta semana?" aria-label="Pregunta para el asistente"
        className="min-h-11 min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm" enterKeyHint="send" />
      <button type="submit" disabled={!q.trim()} aria-label="Preguntar" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground disabled:opacity-40"><ArrowUp className="size-5" aria-hidden /></button>
    </form>
  );
}

/** Texto de IA: muestra el guardado o lo genera (el resumen solo al abrir Inicio sin resumen de hoy; la sugerencia al pulsar). */
export function AiNote({ kind, initial, stale, hasKey }: { kind: "brief" | "suggestion"; initial: string | null; stale: boolean; hasKey: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const asked = useRef(false);
  const run = () => start(async () => { setError(null); const r = await generateHomeAiNote(kind); if (r.ok) { setText(r.content); router.refresh(); } else setError(r.error); });
  useEffect(() => { if (kind === "brief" && !initial && hasKey && !asked.current) { asked.current = true; run(); } }); // una vez por visita, y el servidor lo cachea
  if (!hasKey) return <p className="text-sm text-muted">Configura la clave de Gemini para activar la IA.</p>;
  return (
    <div className="flex flex-1 flex-col gap-2">
      {text ? <div className="whitespace-pre-line text-sm leading-relaxed">{text}</div>
        : pending ? <div className="flex flex-col gap-2" aria-busy="true" aria-label="Generando"><div className="skeleton h-3 w-full" /><div className="skeleton h-3 w-5/6" /><div className="skeleton h-3 w-2/3" /></div>
        : <p className="text-sm text-muted">{kind === "brief" ? "Aún no hay resumen de hoy." : "Pulsa para que la IA te diga qué hacer ahora."}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {(kind === "suggestion" ? !text || stale : !text) && (
        <button type="button" onClick={run} disabled={pending} className="mt-auto flex min-h-11 items-center justify-center gap-2 self-start rounded-full border border-border px-4 text-sm font-medium disabled:opacity-50">
          {text ? <RefreshCw className="size-4" aria-hidden /> : <Sparkles className="size-4 text-accent" aria-hidden />}{pending ? "Pensando…" : text ? "Otra sugerencia" : kind === "brief" ? "Generar resumen" : "Sugerir"}
        </button>
      )}
    </div>
  );
}

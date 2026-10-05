"use client";

import { Loader2, Mic, Square } from "lucide-react";
import { useRef, useState } from "react";
import { encodeWav, pickRecorderMime } from "@/lib/audio/wav";
import { cn } from "@/lib/utils";

const MAX_SECONDS = 75;
const TARGET_RATE = 16000;

/** Graba, convierte a WAV 16 kHz mono (formato universal) y lo manda a transcribir. Solo se guarda el texto. */
async function toWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
    const off = new OfflineAudioContext(1, frames, TARGET_RATE);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const rendered = await off.startRendering();
    return new Blob([encodeWav(rendered.getChannelData(0), TARGET_RATE)], { type: "audio/wav" });
  } finally {
    void ctx.close();
  }
}

export function VoiceButton({ onText, onError, className }: { onText: (t: string) => void; onError?: (m: string) => void; className?: string }) {
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function start() {
    try {
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador no puede grabar audio.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const mimeType = pickRecorderMime((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearTimeout(timer.current);
        setState("working");
        try {
          const wav = await toWav(new Blob(chunks.current, { type: r.mimeType || mimeType || "audio/mp4" }));
          const fd = new FormData();
          fd.append("audio", wav, "voz.wav");
          const res = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
          const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
          if (!res.ok) throw new Error(json.error ?? "No se pudo transcribir");
          if (json.text) onText(json.text); else onError?.("No se ha entendido nada. Inténtalo de nuevo.");
        } catch (e) {
          onError?.(e instanceof Error ? e.message : "No se pudo transcribir");
        } finally {
          setState("idle");
        }
      };
      rec.current = r;
      r.start();
      setState("recording");
      timer.current = setTimeout(() => r.state === "recording" && r.stop(), MAX_SECONDS * 1000);
    } catch (e) {
      setState("idle");
      onError?.(e instanceof DOMException && e.name === "NotAllowedError" ? "Permite el micrófono para dictar." : e instanceof Error ? e.message : "No se pudo grabar");
    }
  }

  const stop = () => rec.current?.state === "recording" && rec.current.stop();
  return (
    <button
      type="button" onClick={state === "recording" ? stop : state === "idle" ? () => void start() : undefined} disabled={state === "working"}
      aria-label={state === "recording" ? "Parar y transcribir" : "Dictar por voz"} aria-pressed={state === "recording"}
      className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-surface-2 md:size-9", state === "recording" && "animate-pulse border-danger bg-danger/10 text-danger", className)}
    >
      {state === "working" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : state === "recording" ? <Square className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
    </button>
  );
}

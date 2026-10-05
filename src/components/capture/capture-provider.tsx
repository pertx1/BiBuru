"use client";

import { Send, WifiOff, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { captureItem } from "@/app/(app)/bandeja/actions";
import { VoiceButton } from "@/components/ai/voice-button";
import { useToast } from "@/components/ui/toast";
import { enqueue, flushQueue, queueSize, type QueuedCapture, type SendResult } from "@/lib/capture/queue";
import { useRouter } from "next/navigation";

type Ctx = { open: () => void; pending: number };
const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
};

const CaptureContext = createContext<Ctx>({ open: () => {}, pending: 0 });
export const useCapture = () => useContext(CaptureContext);

async function send(c: QueuedCapture): Promise<SendResult> {
  try {
    const r = await captureItem({ clientId: c.clientId, text: c.text, capturedAt: c.capturedAt, source: c.source });
    if (r.ok) return "ok";
    return r.permanent ? "drop" : "retry";
  } catch {
    return "retry"; // sin red, sesión caducada…: se conserva y se reintenta
  }
}

/**
 * Captura rápida: abre al instante, guarda con Enter. La captura se escribe primero en el
 * dispositivo (cola local) y luego se envía; si no hay red o falla, no se pierde.
 */
export function CaptureProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(0);
  const [voiced, setVoiced] = useState(false);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const ref = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();
  const router = useRouter();

  const flush = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const r = await flushQueue(send);
    setPending(r.remaining);
    if (r.sent > 0) router.refresh();
  }, [router]);

  useEffect(() => {
    // Estado inicial desde la cola local y reintento al arrancar, al volver la red y al volver a la app.
    void queueSize().then(setPending).then(flush);
    const on = () => void flush();
    const vis = () => { if (document.visibilityState === "visible") void flush(); };
    window.addEventListener("online", on);
    document.addEventListener("visibilitychange", vis);
    const t = setInterval(() => void flush(), 30_000);
    const params = new URLSearchParams(window.location.search);
    if (params.get("capturar") === "1") setTimeout(() => setOpen(true), 0);
    return () => { window.removeEventListener("online", on); document.removeEventListener("visibilitychange", vis); clearInterval(t); };
  }, [flush]);

  useEffect(() => { if (open) setTimeout(() => ref.current?.focus(), 30); }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function save() {
    const value = text.trim();
    if (!value) return;
    const item = { clientId: crypto.randomUUID(), text: value.slice(0, 10000), capturedAt: new Date().toISOString(), source: voiced ? ("voice" as const) : ("text" as const) };
    await enqueue(item); // primero en el dispositivo: pase lo que pase, no se pierde
    setText("");
    setVoiced(false);
    setOpen(false);
    setPending((n) => n + 1);
    toast({ message: navigator.onLine ? "Guardado en la bandeja ✔" : "Guardado. Se enviará al volver la conexión", durationMs: 2500 });
    void flush();
  }

  return (
    <CaptureContext.Provider value={{ open: () => setOpen(true), pending }}>
      {children}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center" onClick={(e) => e.target === e.currentTarget && setOpen(false)} role="presentation">
          <div role="dialog" aria-modal="true" aria-label="Captura rápida" className="w-full rounded-t-2xl border border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl md:max-w-lg md:rounded-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold">Captura rápida</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="flex size-11 items-center justify-center rounded-lg hover:bg-surface-2 md:size-9"><X className="size-5" aria-hidden /></button>
            </div>
            <textarea
              ref={ref} value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={10000} autoFocus enterKeyHint="send"
              placeholder="Apunta lo que sea: una idea, una tarea, un gasto, un enlace…"
              aria-label="Texto de la captura"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void save(); } }}
              className="w-full resize-none rounded-xl border border-border bg-background p-3 text-base outline-none focus:border-accent md:text-sm"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-xs text-muted">
                {!online ? <><WifiOff className="size-3.5" aria-hidden /> Sin conexión: se guardará en el dispositivo</> : pending > 0 ? `${pending} esperando para enviarse` : "Enter guarda · Mayús+Enter salto de línea"}
              </p>
              <span className="flex items-center gap-2">
                {online && <VoiceButton onText={(t) => { setText((x) => (x ? `${x} ${t}` : t)); setVoiced(true); setTimeout(() => ref.current?.focus(), 0); }} onError={(m) => toast({ message: m })} />}
              <button type="button" onClick={() => void save()} disabled={!text.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-50 md:min-h-9">
                <Send className="size-4" aria-hidden /> Guardar
              </button>
              </span>
            </div>
          </div>
        </div>
      )}
    </CaptureContext.Provider>
  );
}

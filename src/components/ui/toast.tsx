"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ToastOptions = { message: string; actionLabel?: string; onAction?: () => void; durationMs?: number };
type ToastState = ToastOptions & { id: number };

const ToastContext = createContext<(t: ToastOptions) => void>(() => {});
export const useToast = () => useContext(ToastContext);

/** Avisos breves con botón opcional (p. ej. "Deshacer"). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((t: ToastOptions) => {
    clearTimeout(timer.current);
    setToast({ ...t, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), t.durationMs ?? 6000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Con una hoja abierta (<dialog> modal, que va en la «capa superior»), el aviso quedaría debajo y no se vería.
  // Se muestra como popover para ponerlo encima de todo; se vuelve a abrir en cada aviso para quedar el último.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current as (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
    if (!el?.showPopover) return;
    try {
      if (el.matches(":popover-open")) el.hidePopover!();
      if (toast) el.showPopover();
    } catch { /* navegador sin popover: se queda como capa normal */ }
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        ref={box}
        popover="manual"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-auto bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 m-0 flex h-auto w-auto justify-center overflow-visible border-0 bg-transparent p-0 px-4 md:bottom-6 [&:not(:popover-open)]:flex"
      >
        {toast && (
          <div className="pointer-events-auto flex items-center gap-3 rounded-xl bg-foreground px-4 py-3 text-sm text-background shadow-lg">
            <span>{toast.message}</span>
            {toast.actionLabel && (
              <button
                type="button"
                className="min-h-11 md:min-h-9 font-semibold underline underline-offset-2"
                onClick={() => {
                  toast.onAction?.();
                  setToast(null);
                }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

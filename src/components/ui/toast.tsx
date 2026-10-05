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

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6"
      >
        {toast && (
          <div className="pointer-events-auto flex items-center gap-3 rounded-xl bg-foreground px-4 py-3 text-sm text-background shadow-lg">
            <span>{toast.message}</span>
            {toast.actionLabel && (
              <button
                type="button"
                className="min-h-9 font-semibold underline underline-offset-2"
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

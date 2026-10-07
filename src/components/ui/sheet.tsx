"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Panel modal basado en <dialog> nativo (accesible, cierra con Esc, atrapa el
 * foco). En móvil sube desde abajo; en escritorio aparece centrado.
 */
export function Sheet({
  open, onClose, title, children, className, variant = "sheet",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  /** "panel": a pantalla completa en móvil y panel lateral derecho en escritorio (formularios largos). */
  variant?: "sheet" | "panel";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // clic en el fondo
      }}
      onFocus={(e) => {
        // Con el teclado del móvil abierto, el campo enfocado se lleva al centro para que no quede tapado.
        const el = e.target;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
          setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
        }
      }}
      className={cn(
        variant === "panel"
          ? "m-0 h-dvh max-h-dvh w-full max-w-none overflow-y-auto border-0 bg-surface p-0 pt-[env(safe-area-inset-top)] text-foreground shadow-xl backdrop:bg-black/40 md:ml-auto md:h-dvh md:w-[min(42rem,100vw)] md:border-l md:border-border md:pt-0"
          : "m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/40 md:m-auto md:max-w-xl md:rounded-2xl",
        className,
      )}
    >
      {open && (
        <div className="flex flex-col gap-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-6">
          <div className={cn("flex items-center justify-between gap-4", variant === "panel" && "sticky top-0 z-10 -mx-4 -mt-4 bg-surface/95 px-4 py-2 backdrop-blur md:-mx-6 md:-mt-6 md:px-6")}>
            <h2 className="text-lg font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex size-11 items-center justify-center rounded-lg hover:bg-surface-2 md:size-9"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

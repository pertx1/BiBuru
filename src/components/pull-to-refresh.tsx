"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

const TRIGGER = 70;

/**
 * Tirar hacia abajo para actualizar (en la app instalada del iPhone no existe de serie).
 * Solo con el dedo, con la página arriba del todo y fuera de diálogos o zonas de arrastre (`touch-none`, `[data-no-ptr]`).
 */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, start] = useTransition();
  const from = useRef<number | null>(null);

  useEffect(() => {
    const blocked = (el: EventTarget | null) => el instanceof Element && !!el.closest("dialog[open], .touch-none, [data-no-ptr], input, textarea, select");
    const onStart = (e: TouchEvent) => { from.current = window.scrollY <= 0 && !blocked(e.target) ? e.touches[0].clientY : null; };
    const onMove = (e: TouchEvent) => {
      if (from.current === null) return;
      const d = e.touches[0].clientY - from.current;
      if (d <= 0 || window.scrollY > 0) { setPull(0); return; }
      setPull(Math.min(110, d * 0.5));
    };
    const onEnd = () => {
      if (from.current === null) return;
      from.current = null;
      setPull((p) => { if (p >= TRIGGER) start(() => router.refresh()); return 0; });
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  if (!pull && !refreshing) return null;
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-[calc(env(safe-area-inset-top)+0.5rem)]"
      style={{ transform: `translateY(${refreshing ? 24 : pull - 30}px)` }}>
      <span className="flex size-9 items-center justify-center rounded-full border border-border bg-surface shadow">
        <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)`, opacity: Math.min(1, pull / TRIGGER) }} aria-hidden />
        <span className="sr-only">{refreshing ? "Actualizando…" : pull >= TRIGGER ? "Suelta para actualizar" : "Tira para actualizar"}</span>
      </span>
    </div>
  );
}

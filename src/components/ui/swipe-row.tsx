"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

const THRESHOLD = 80;

/**
 * Fila deslizable con el dedo: a la derecha → `onRight` (p. ej. completar), a la izquierda → `onLeft` (p. ej. posponer).
 * Solo reacciona a gestos táctiles claramente horizontales; el desplazamiento vertical de la página no se ve afectado.
 */
export function SwipeRow({ children, onRight, onLeft, rightLabel, leftLabel, className }: {
  children: React.ReactNode; onRight?: () => void; onLeft?: () => void; rightLabel: React.ReactNode; leftLabel: React.ReactNode; className?: string;
}) {
  const start = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const last = useRef(0); // valor más reciente (los eventos pueden llegar antes de que React vuelva a pintar)

  return (
    <li className={cn("relative overflow-hidden", className)}>
      <div aria-hidden className={cn("absolute inset-0 flex items-center justify-between px-4 text-sm font-semibold", dx > 0 ? "bg-good/20 text-good" : dx < 0 ? "bg-accent/20 text-accent" : "")}>
        <span className={dx > 0 ? "" : "invisible"}>{rightLabel}</span>
        <span className={dx < 0 ? "" : "invisible"}>{leftLabel}</span>
      </div>
      <div
        className="relative flex items-stretch bg-surface"
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dragging ? "none" : "transform 160ms ease-out" }}
        onTouchStart={(e) => { const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY, horizontal: null }; }}
        onTouchMove={(e) => {
          const s = start.current; if (!s) return;
          const t = e.touches[0], mx = t.clientX - s.x, my = t.clientY - s.y;
          if (s.horizontal === null && (Math.abs(mx) > 10 || Math.abs(my) > 10)) s.horizontal = Math.abs(mx) > Math.abs(my) * 1.5;
          if (!s.horizontal) return;
          const v = Math.max(onLeft ? -140 : 0, Math.min(onRight ? 140 : 0, mx));
          last.current = v;
          setDragging(true);
          setDx(v);
        }}
        onTouchEnd={() => {
          const v = last.current; last.current = 0; start.current = null; setDragging(false); setDx(0);
          if (v >= THRESHOLD) onRight?.(); else if (v <= -THRESHOLD) onLeft?.();
        }}
        onTouchCancel={() => { last.current = 0; start.current = null; setDragging(false); setDx(0); }}
      >
        {children}
      </div>
    </li>
  );
}

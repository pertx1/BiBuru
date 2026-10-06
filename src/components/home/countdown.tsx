"use client";

import { useSyncExternalStore } from "react";

function text(ms: number): string {
  if (ms <= 0) return "ahora";
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d >= 2) return `en ${d} días`;
  if (h >= 1) return `en ${h} h ${m % 60} min`;
  return `en ${Math.max(1, m)} min`;
}

// Reloj por minutos compartido: el valor solo cambia una vez por minuto.
const subscribe = (cb: () => void) => { const t = setInterval(cb, 15_000); return () => clearInterval(t); };
const minuteNow = () => Math.floor(Date.now() / 60_000);

/** Cuenta atrás que se actualiza cada minuto (en el servidor no se pinta para no desajustar la hidratación). */
export function Countdown({ target }: { target: string }) {
  const minute = useSyncExternalStore(subscribe, minuteNow, () => null);
  return <span>{minute === null ? " " : text(Date.parse(target) - minute * 60_000)}</span>;
}

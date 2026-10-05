"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
};

/** Aviso fijo cuando no hay conexión: lo que se ve es lo último cargado; las capturas se guardan en el dispositivo. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-40 flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 pt-[calc(0.375rem+env(safe-area-inset-top))] text-center text-xs font-medium text-black">
      <WifiOff className="size-3.5 shrink-0" aria-hidden /> Sin conexión: ves lo último cargado. Las capturas se guardan y se envían al volver.
    </div>
  );
}

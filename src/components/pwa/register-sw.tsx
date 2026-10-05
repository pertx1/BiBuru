"use client";

import { useEffect } from "react";

/** Registra el service worker (solo en producción, para no estorbar en desarrollo). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((e) => console.error("No se pudo registrar el service worker", e));
  }, []);
  return null;
}

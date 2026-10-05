"use client";

import { useSyncExternalStore } from "react";
import { Share, SquarePlus } from "lucide-react";

type Mode = "ios-browser" | "installed" | "other";

function detect(): Mode {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  return isIos ? "ios-browser" : "other";
}

const subscribe = () => () => {};

export function InstallGuide() {
  const mode = useSyncExternalStore<Mode | null>(subscribe, detect, () => null);
  if (mode === null) return <div className="skeleton h-20" />;
  if (mode === "installed") return <p className="text-sm text-muted">La app está instalada en este dispositivo. ✔</p>;
  if (mode === "other") {
    return (
      <p className="text-sm text-muted">
        En Chrome de escritorio, pulsa el icono de instalar que aparece a la derecha de la barra de direcciones.
      </p>
    );
  }
  return (
    <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
      <li>Abre esta página en <strong>Safari</strong> (no en otro navegador).</li>
      <li>
        Pulsa el botón Compartir <Share className="inline size-4 align-text-bottom" aria-label="Compartir" /> de la barra inferior.
      </li>
      <li>
        Elige <strong>«Añadir a pantalla de inicio»</strong> <SquarePlus className="inline size-4 align-text-bottom" aria-hidden />.
      </li>
      <li>Pulsa <strong>Añadir</strong> y abre BiBuru desde su icono nuevo.</li>
    </ol>
  );
}

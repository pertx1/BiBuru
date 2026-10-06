"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { TopicIcon } from "./topic-icon";

/**
 * Foto de la noticia desde su dirección original (carga diferida, sin copias), con el medio visible.
 * Si no hay o falla: recuadro con el color y el icono del tema.
 */
export function NewsImage({ src, outlet, color, icon, hero, className }: { src: string | null; outlet: string | null; color: string; icon: string; hero?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  const show = src && !failed;
  return (
    <div className={cn("relative shrink-0 overflow-hidden bg-surface-2", hero ? "aspect-[16/9] w-full rounded-xl" : "size-20 rounded-lg md:size-24", className)}
      style={show ? undefined : { background: `linear-gradient(135deg, ${color}33, ${color}11)` }}>
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagen externa del medio, sin copia ni optimización
        <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center" style={{ color }}><TopicIcon name={icon} className={hero ? "size-12" : "size-7"} /></div>
      )}
      {hero && outlet && <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">{outlet}</span>}
    </div>
  );
}

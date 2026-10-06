"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { generateNewsNow } from "@/app/(app)/noticias/actions";
import { useToast } from "@/components/ui/toast";

/** «Generar ahora» (máx. 2 al día). */
export function GenerateNewsButton({ left }: { left: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending || left <= 0} onClick={() => start(async () => { const r = await generateNewsNow(); toast({ message: r.ok ? `Resumen listo (${r.items ?? 0} noticias)` : r.error }); router.refresh(); })}
      className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold disabled:opacity-50" title={left <= 0 ? "Ya lo has generado 2 veces hoy" : undefined}>
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} aria-hidden />{pending ? "Generando… (hasta 1 min)" : `Generar ahora${left < 2 ? ` (${left})` : ""}`}
    </button>
  );
}

"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { refreshAll } from "@/app/(app)/redes/sync-actions";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** «Actualizar todo»: seguidores, publicaciones, mensajes, comentarios y correos de todas las cuentas, ya. */
export function RefreshAll() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => {
      const r = await refreshAll();
      toast({ message: r.ok ? r.message : r.error });
      router.refresh();
    })} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-fill px-4 text-sm font-semibold hover:bg-fill-strong disabled:opacity-50 md:min-h-9">
      <RefreshCw className={cn("size-4", pending && "animate-spin")} aria-hidden /> {pending ? "Actualizando…" : "Actualizar todo"}
    </button>
  );
}

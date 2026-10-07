"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Actualización en vivo de la bandeja y los contadores: escucha los cambios de `social_threads` (Supabase Realtime, con RLS)
 * y refresca la pantalla sin recargar. Si el tiempo real no está disponible, repasa cada 60 s mientras la pestaña está visible.
 */
export function InboxLive({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const last = useRef(0);
  useEffect(() => {
    const refresh = () => { if (Date.now() - last.current > 1500) { last.current = Date.now(); router.refresh(); } };
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    let supabase: ReturnType<typeof createClient> | null = null;
    try {
      supabase = createClient();
      channel = supabase.channel("bandeja").on("postgres_changes", { event: "*", schema: "public", table: "social_threads" }, refresh).subscribe();
    } catch { /* sin tiempo real: queda el repaso periódico */ }
    const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, intervalMs);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); if (channel && supabase) void supabase.removeChannel(channel); };
  }, [router, intervalMs]);
  return null;
}

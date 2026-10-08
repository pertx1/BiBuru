"use client";

import { Archive, CheckCheck, ExternalLink, FileText, ListPlus, Mail, MoreHorizontal, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { mailToNote, mailToTask, setMailTriage } from "@/app/(app)/correo/actions";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { MSG_STATUS_LABEL, orderHref, type UnifiedItem } from "@/lib/messages/unified";
import { cn } from "@/lib/utils";


function when(iso: string, now: number) {
  const d = new Date(iso), mins = Math.round((now - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min`;
  if (mins < 24 * 60) return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", timeZone: "Europe/Madrid" });
}

/**
 * Mensajes del negocio (correo): persona, vista previa y hora. Se abre en el lector de Correo («Responder en Outlook»).
 * Acciones: Crear pedido (con el cliente rellenado), Crear tarea, Guardar como nota y marcar respondido o archivar.
 */
export function BusinessMessages({ businessId, items, nowMs }: { businessId: string; items: UnifiedItem[]; nowMs: number }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [menu, setMenu] = useState<UnifiedItem | null>(null);

  const act = (fn: () => Promise<{ ok: boolean; error?: string; href?: string }>, ok: string) => start(async () => {
    const r = await fn();
    setMenu(null);
    if (!r.ok) { toast({ message: r.error ?? "No se pudo" }); return; }
    toast(r.href ? { message: ok, actionLabel: "Abrir", onAction: () => router.push(r.href!) } : { message: ok });
    router.refresh();
  });
  const setStatus = (i: UnifiedItem, s: "respondido" | "archivado" | "sin_responder") =>
    act(() => setMailTriage(i.id, s === "sin_responder" ? null : s), s === "archivado" ? "Archivado" : s === "respondido" ? "Marcado como respondido" : "Marcado sin responder");

  if (items.length === 0) return <p className="rounded-xl bg-surface p-8 text-center text-sm text-muted">Nada por aquí con estos filtros.</p>;
  return (
    <>
      <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface">
        {items.map((i) => {
          return (
            <li key={i.key} className="flex items-stretch">
              <Link href={i.href} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-2.5 active:bg-fill md:hover:bg-fill">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300" aria-hidden><Mail className="size-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-sm", i.status === "sin_responder" ? "font-semibold" : "font-medium")}>{i.person}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">{when(i.at, nowMs)}</span>
                  </span>
                  <span className="block truncate text-sm text-muted">{i.preview || "(sin texto)"}</span>
                  <span className="block truncate text-xs text-muted">{i.kind} · {i.account}{i.status ? ` · ${MSG_STATUS_LABEL[i.status]}` : " · Leído"}</span>
                </span>
              </Link>
              <button type="button" onClick={() => setMenu(i)} aria-label={`Acciones de ${i.person}`} className="flex w-12 shrink-0 items-center justify-center text-muted hover:text-foreground">
                <MoreHorizontal className="size-5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu ? menu.person : "Acciones"}>
        {menu && (
          <div className="flex flex-col gap-2">
            <p className="line-clamp-3 text-sm text-muted">{menu.preview}</p>
            {menu.externalUrl && <a href={menu.externalUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center gap-3 rounded-xl bg-fill px-4 text-sm font-medium"><ExternalLink className="size-5" aria-hidden /> Responder en Outlook</a>}
            <Link href={orderHref(businessId, menu.person, menu.channel)} className="flex min-h-12 items-center gap-3 rounded-xl bg-fill px-4 text-sm font-medium"><ShoppingBag className="size-5" aria-hidden /> Crear pedido</Link>
            <button type="button" disabled={busy} onClick={() => act(() => mailToTask(menu.id), "Tarea creada")} className="flex min-h-12 items-center gap-3 rounded-xl bg-fill px-4 text-left text-sm font-medium"><ListPlus className="size-5" aria-hidden /> Crear tarea</button>
            <button type="button" disabled={busy} onClick={() => act(() => mailToNote(menu.id), "Nota guardada")} className="flex min-h-12 items-center gap-3 rounded-xl bg-fill px-4 text-left text-sm font-medium"><FileText className="size-5" aria-hidden /> Guardar como nota</button>
            <div className="grid grid-cols-2 gap-2">
              {menu.status === "respondido"
                ? <button type="button" disabled={busy} onClick={() => setStatus(menu, "sin_responder")} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-fill text-sm font-medium">Sin responder</button>
                : <button type="button" disabled={busy} onClick={() => setStatus(menu, "respondido")} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-fill text-sm font-medium"><CheckCheck className="size-4" aria-hidden /> Respondido</button>}
              {menu.status === "archivado"
                ? <button type="button" disabled={busy} onClick={() => setStatus(menu, "sin_responder")} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-fill text-sm font-medium">Desarchivar</button>
                : <button type="button" disabled={busy} onClick={() => setStatus(menu, "archivado")} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-fill text-sm font-medium"><Archive className="size-4" aria-hidden /> Archivar</button>}
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

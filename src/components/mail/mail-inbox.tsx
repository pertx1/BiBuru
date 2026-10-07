"use client";

import { AlertTriangle, Paperclip, RefreshCw, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { syncMailNow } from "@/app/(app)/correo/actions";
import { cn } from "@/lib/utils";
import { MailViewer } from "./mail-viewer";

type Msg = { id: string; account_id: string; from_name: string | null; from_address: string | null; subject: string | null; preview: string | null; received_at: string; is_read: boolean; has_attachments: boolean; web_link: string | null };
type Acc = { id: string; email: string; business_id: string | null; status: string; last_error: string | null };

function when(iso: string) {
  const d = new Date(iso), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
}

/** Bandeja unificada: filtros por cuenta y negocio, «No leídos», buscador y lector en panel. */
export function MailInbox({ accounts, businesses, messages, filters, openId }: {
  accounts: Acc[]; businesses: { id: string; name: string; color: string }[]; messages: Msg[]; filters: { cuenta: string; negocio: string; filtro: string; q: string }; openId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(filters.q);
  const [open, setOpen] = useState<string | null>(openId);
  const [syncing, start] = useTransition();
  const go = (k: string, v: string) => { const n = new URLSearchParams(sp.toString()); if (v) n.set(k, v); else n.delete(k); n.delete("abrir"); router.replace(`${pathname}?${n}`, { scroll: false }); };
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const bizById = new Map(businesses.map((b) => [b.id, b]));
  const broken = accounts.filter((a) => a.status !== "ok");
  const chip = (on: boolean) => cn("inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 text-sm md:min-h-9", on ? "border-accent bg-accent/15 font-semibold" : "border-border text-muted");
  const current = messages.find((m) => m.id === open) ?? null;

  return (
    <div className="flex flex-col gap-3">
      {broken.map((a) => (
        <p key={a.id} className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span><strong>{a.email}</strong>: {a.status === "revoked" ? "hay que volver a conectarla." : a.last_error ?? "error al sincronizar; se reintenta sola."} <a href="/api/outlook/connect" className="text-accent underline">Reconectar</a></span></p>
      ))}
      <div className="flex gap-2">
        <form className="relative flex-1" onSubmit={(e) => { e.preventDefault(); go("q", q.trim()); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar remitente o asunto" aria-label="Buscar correos" enterKeyHint="search"
            className="min-h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-base md:min-h-9 md:text-sm" />
        </form>
        <button type="button" onClick={() => start(async () => { await syncMailNow(); router.refresh(); })} aria-label="Actualizar ahora" className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border md:size-9">
          <RefreshCw className={cn("size-4", syncing && "animate-spin")} aria-hidden />
        </button>
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        <button type="button" className={chip(filters.filtro !== "no-leidos")} onClick={() => go("filtro", "")}>Todos</button>
        <button type="button" className={chip(filters.filtro === "no-leidos")} onClick={() => go("filtro", "no-leidos")}>No leídos</button>
        {accounts.length > 1 && accounts.map((a) => <button key={a.id} type="button" className={chip(filters.cuenta === a.id)} onClick={() => go("cuenta", filters.cuenta === a.id ? "" : a.id)}>{a.email}</button>)}
        {businesses.filter((b) => accounts.some((a) => a.business_id === b.id)).map((b) => (
          <button key={b.id} type="button" className={chip(filters.negocio === b.id)} onClick={() => go("negocio", filters.negocio === b.id ? "" : b.id)}>
            <span className="mr-1.5 size-2 rounded-full" style={{ background: b.color }} aria-hidden />{b.name}
          </button>
        ))}
      </div>
      {messages.length === 0 ? <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">No hay correos con estos filtros. La primera sincronización puede tardar unos minutos.</p> : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {messages.map((m) => {
            const acc = accById.get(m.account_id), biz = acc?.business_id ? bizById.get(acc.business_id) : undefined;
            return (
              <li key={m.id}>
                <button type="button" onClick={() => setOpen(m.id)} className="flex min-h-16 w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-surface-2">
                  <span className="flex items-baseline gap-2">
                    {!m.is_read && <span className="size-2 shrink-0 self-center rounded-full bg-accent" aria-label="Sin leer" />}
                    <span className={cn("min-w-0 flex-1 truncate text-sm", !m.is_read && "font-semibold")}>{m.from_name || m.from_address || "(sin remitente)"}</span>
                    {m.has_attachments && <Paperclip className="size-3.5 shrink-0 text-muted" aria-label="Con adjuntos" />}
                    <span className="shrink-0 text-xs text-muted">{when(m.received_at)}</span>
                  </span>
                  <span className={cn("truncate text-sm", !m.is_read ? "text-foreground" : "text-muted")}>{m.subject || "(sin asunto)"}</span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {biz && <span className="inline-flex shrink-0 items-center gap-1"><span className="size-2 rounded-full" style={{ background: biz.color }} aria-hidden />{biz.name}</span>}
                    <span className="truncate">{m.preview}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {current && <MailViewer key={current.id} id={current.id} subject={current.subject} onClose={() => setOpen(null)} />}
    </div>
  );
}

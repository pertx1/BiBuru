import { AtSign, ExternalLink, MessageCircle, MessagesSquare, Search } from "lucide-react";
import Link from "next/link";
import { CAPABILITIES, KIND_LABEL, LABELS, STATUS_LABEL, type InboxFilters, type Platform } from "@/lib/inbox/logic";
import type { ThreadRow } from "@/lib/inbox/data";
import { hasInboxScopes } from "@/lib/social/instagram";
import { cn } from "@/lib/utils";
import { InboxLive } from "./inbox-live";

type Acc = { id: string; platform: string; username: string | null; scopes: string | null; business_id: string | null };
const ICON = { dm: MessageCircle, comment: MessagesSquare, mention: AtSign } as const;
const PLAT = { instagram: "Instagram", tiktok: "TikTok" } as const;

const time = (iso: string) => {
  const d = new Date(iso), now = new Date();
  const same = d.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat("es-ES", same ? { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" } : { day: "2-digit", month: "2-digit", timeZone: "Europe/Madrid" }).format(d);
};

/** Bandeja: mensajes directos, comentarios y menciones de todas las cuentas (o de un negocio), con filtros en la URL. */
export function InboxView({ accounts, threads, filters, basePath, keepParams, businessId }: {
  accounts: Acc[]; threads: ThreadRow[]; filters: InboxFilters; basePath: string; keepParams: Record<string, string | undefined>; businessId: string | null;
}) {
  const href = (o: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...keepParams, red: filters.red, cuenta: filters.cuenta, tipo: filters.tipo, estado: filters.estado === "sin_responder" ? undefined : filters.estado, q: filters.q, etiqueta: filters.etiqueta, ...o })) if (v) q.set(k, v);
    return `${basePath}?${q}`;
  };
  const chip = (on: boolean) => cn("inline-flex min-h-11 shrink-0 items-center rounded-full border border-border bg-surface px-3 text-sm md:min-h-9", on && "border-accent bg-accent text-accent-foreground");
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const igNoScopes = accounts.filter((a) => a.platform === "instagram" && !hasInboxScopes(a.scopes));
  const tiktok = accounts.some((a) => a.platform === "tiktok");

  if (!accounts.length) return <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">Conecta una cuenta de Instagram para ver aquí sus mensajes, comentarios y menciones.</p>;
  return (
    <div className="flex flex-col gap-3">
      <InboxLive />
      {igNoScopes.length > 0 && (
        <div role="status" className="rounded-xl bg-accent/10 p-3 text-sm">
          <p className="font-semibold">Activa los mensajes de Instagram</p>
          <p className="mt-0.5 text-muted">Para ver y responder mensajes y comentarios hay que dar dos permisos más ({igNoScopes.map((a) => `@${a.username}`).join(", ")}). Antes, añádelos en la app de Meta (guía, bloque H).</p>
          <a href="/api/instagram/connect?mensajes=1" className="mt-2 inline-flex min-h-11 items-center rounded-full bg-accent px-4 font-semibold text-accent-foreground md:min-h-9">Activar mensajes</a>
        </div>
      )}
      {tiktok && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl bg-surface p-3 text-sm text-muted">
          {CAPABILITIES.tiktok.note}
          <a href={CAPABILITIES.tiktok.openDmsUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent md:min-h-9">Abrir mensajes en TikTok <ExternalLink className="size-3.5" aria-hidden /></a>
        </p>
      )}

      <form action={basePath} className="relative">
        {Object.entries({ ...keepParams, red: filters.red, cuenta: filters.cuenta, tipo: filters.tipo, estado: filters.estado === "sin_responder" ? undefined : filters.estado, etiqueta: filters.etiqueta }).map(([k, v]) => v ? <input key={k} type="hidden" name={k} value={v} /> : null)}
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input type="search" name="q" defaultValue={filters.q} placeholder="Buscar persona o texto" aria-label="Buscar en la bandeja" enterKeyHint="search"
          className="min-h-11 w-full rounded-lg border border-transparent bg-fill pl-9 pr-3 text-base md:min-h-9 md:text-sm" />
      </form>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" aria-label="Estado">
        {(["sin_responder", "respondido", "archivado", "todos"] as const).map((s) => <Link key={s} href={href({ estado: s === "sin_responder" ? undefined : s })} className={chip((filters.estado ?? "sin_responder") === s)}>{s === "todos" ? "Todos" : STATUS_LABEL[s]}</Link>)}
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" aria-label="Más filtros">
        {(["dm", "comment", "mention"] as const).map((k) => <Link key={k} href={href({ tipo: filters.tipo === k ? undefined : k })} className={chip(filters.tipo === k)}>{KIND_LABEL[k]}s</Link>)}
        {[...new Set(accounts.map((a) => a.platform))].length > 1 && (["instagram", "tiktok"] as const).map((r) => <Link key={r} href={href({ red: filters.red === r ? undefined : r })} className={chip(filters.red === r)}>{PLAT[r]}</Link>)}
        {accounts.length > 1 && accounts.map((a) => <Link key={a.id} href={href({ cuenta: filters.cuenta === a.id ? undefined : a.id })} className={chip(filters.cuenta === a.id)}>@{a.username}</Link>)}
        {LABELS.map((l) => <Link key={l} href={href({ etiqueta: filters.etiqueta === l ? undefined : l })} className={chip(filters.etiqueta === l)}>#{l}</Link>)}
      </div>

      {threads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <p className="font-semibold">{(filters.estado ?? "sin_responder") === "sin_responder" && !filters.q ? "Todo respondido" : "No hay nada con estos filtros"}</p>
          <p className="mt-1 text-sm text-muted">Los mensajes llegan en directo y se repasan cada hora.</p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl bg-surface">
          {threads.map((t) => {
            const Icon = ICON[t.kind as keyof typeof ICON] ?? MessageCircle;
            const acc = byId.get(t.account_id);
            return (
              <li key={t.id} className="[&+li_a>div]:shadow-[inset_0_1px_0_var(--border)]">
                <Link href={`/redes/mensajes/${t.id}${businessId ? `?volver=${encodeURIComponent(basePath)}` : ""}`} className="flex items-stretch gap-3 pl-4 active:bg-fill md:hover:bg-fill">
                  <span className="relative mt-3 flex size-10 shrink-0 items-center justify-center rounded-full bg-fill text-muted">
                    <Icon className="size-5" aria-label={KIND_LABEL[t.kind as keyof typeof KIND_LABEL]} />
                    {t.unread && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent" aria-label="Sin leer" />}
                  </span>
                  <div className="flex min-h-16 min-w-0 flex-1 flex-col justify-center gap-0.5 py-2.5 pr-4">
                    <span className="flex items-baseline gap-2">
                      <span className={cn("truncate text-[15px]", t.unread ? "font-semibold" : "font-medium")}>{t.customer_name ?? (t.participant_username ? `@${t.participant_username}` : t.participant_name ?? "Instagram")}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted tabular-nums">{time(t.last_message_at)}</span>
                    </span>
                    <span className={cn("line-clamp-1 text-sm", t.unread ? "text-foreground" : "text-muted")}>{t.preview || (t.kind === "mention" ? "Te han mencionado" : "")}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span>{PLAT[t.platform as Platform]} · @{acc?.username ?? "cuenta"}</span>
                      {t.status !== "sin_responder" && <span>{STATUS_LABEL[t.status as keyof typeof STATUS_LABEL]}</span>}
                      {t.labels.map((l) => <span key={l} className="rounded-full bg-fill px-1.5">#{l}</span>)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

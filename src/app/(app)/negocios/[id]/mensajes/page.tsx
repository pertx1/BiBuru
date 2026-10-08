import Link from "next/link";
import { Search } from "lucide-react";
import { BusinessMessages } from "@/components/messages/business-messages";
import { InboxLive } from "@/components/social/inbox-live";
import { requestNowMs } from "@/lib/dates";
import { CAPABILITIES } from "@/lib/inbox/logic";
import { mailConfigured } from "@/lib/mail/data";
import { listBusinessMessages } from "@/lib/messages/data";
import { CHANNEL_LABEL, MSG_STATUS_LABEL, parseUnifiedFilters, type Channel } from "@/lib/messages/unified";
import { cn } from "@/lib/utils";

export const metadata = { title: "Mensajes del negocio" };

type SP = { canal?: string; estado?: string; q?: string };

/** Mensajes del negocio: correo de sus cuentas de Outlook y mensajes/comentarios de su Instagram y TikTok, en una lista. */
export default async function MensajesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const f = parseUnifiedFilters(sp);
  const { items, accounts } = await listBusinessMessages(id, f);
  const base = `/negocios/${id}/mensajes`;
  const href = (o: SP) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ canal: f.canal, estado: f.estado === "sin_responder" ? undefined : f.estado, q: f.q, ...o })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const chip = (on: boolean) => cn("flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium md:min-h-9", on ? "bg-accent text-accent-foreground" : "bg-fill");
  const noAccounts = !accounts.mail.length && !accounts.social.length;
  return (
    <div className="flex flex-col gap-3">
      {noAccounts && (
        <p className="rounded-xl bg-surface p-4 text-sm">
          <strong>Falta conectar o asignar cuentas.</strong> Aquí se juntan el correo y las redes de este negocio. Conecta Outlook en <Link href="/ajustes#correo" className="text-accent underline">Ajustes</Link> e Instagram o TikTok en <Link href={`/negocios/${id}/redes`} className="text-accent underline">Redes</Link>, y asígnalas a este negocio (en <Link href="/ajustes#sin-negocio" className="text-accent underline">Ajustes › Cuentas sin negocio</Link>).
        </p>
      )}
      {!noAccounts && !accounts.mail.length && mailConfigured() && <p className="text-xs text-muted">Ninguna cuenta de correo asignada a este negocio. Asígnala en <Link href="/ajustes#sin-negocio" className="text-accent underline">Ajustes</Link>.</p>}
      <form action={base} className="flex items-center gap-2 rounded-xl bg-fill px-3">
        <Search className="size-4 shrink-0 text-muted" aria-hidden />
        {f.canal && <input type="hidden" name="canal" value={f.canal} />}
        {f.estado !== "sin_responder" && <input type="hidden" name="estado" value={f.estado} />}
        <input name="q" defaultValue={f.q} placeholder="Buscar persona o texto…" aria-label="Buscar en mensajes" className="min-h-11 w-full bg-transparent text-base outline-none md:text-sm" />
      </form>
      <nav aria-label="Canal" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
        <Link href={href({ canal: undefined })} className={chip(!f.canal)}>Todos</Link>
        {(["correo", "instagram", "tiktok"] as Channel[]).map((c) => <Link key={c} href={href({ canal: c })} className={chip(f.canal === c)}>{CHANNEL_LABEL[c]}</Link>)}
      </nav>
      <nav aria-label="Estado" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
        {(["sin_responder", "respondido", "archivado", "todos"] as const).map((e) => <Link key={e} href={href({ estado: e === "sin_responder" ? undefined : e })} className={chip(f.estado === e)}>{MSG_STATUS_LABEL[e]}</Link>)}
      </nav>
      {f.canal === "tiktok" && <p className="text-xs text-muted">TikTok no deja leer mensajes ni comentarios desde una app propia. <a href={CAPABILITIES.tiktok.openDmsUrl ?? "https://www.tiktok.com/messages"} target="_blank" rel="noopener noreferrer" className="text-accent underline">Abrir mensajes en TikTok</a></p>}
      <BusinessMessages businessId={id} items={items} nowMs={requestNowMs()} />
      <InboxLive />
    </div>
  );
}

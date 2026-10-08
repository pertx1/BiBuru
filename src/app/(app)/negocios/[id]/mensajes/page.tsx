import Link from "next/link";
import { Search } from "lucide-react";
import { BusinessMessages } from "@/components/messages/business-messages";
import { requestNowMs } from "@/lib/dates";
import { mailConfigured } from "@/lib/mail/data";
import { listBusinessMessages } from "@/lib/messages/data";
import { MSG_STATUS_LABEL, parseUnifiedFilters } from "@/lib/messages/unified";
import { cn } from "@/lib/utils";

export const metadata = { title: "Mensajes del negocio" };

type SP = { estado?: string; q?: string };

/** Mensajes del negocio: el correo de sus cuentas de Outlook, con estado (sin responder / respondido / archivado) y buscador. */
export default async function MensajesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const f = { ...parseUnifiedFilters(sp), canal: undefined };
  const { items, accounts } = await listBusinessMessages(id, f);
  const base = `/negocios/${id}/mensajes`;
  const href = (o: SP) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ estado: f.estado === "sin_responder" ? undefined : f.estado, q: f.q, ...o })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const chip = (on: boolean) => cn("flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium md:min-h-9", on ? "bg-accent text-accent-foreground" : "bg-fill");
  return (
    <div className="flex flex-col gap-3">
      {!accounts.mail.length && (
        <p className="rounded-xl bg-surface p-4 text-sm">
          <strong>Ninguna cuenta de correo asignada a este negocio.</strong> {mailConfigured() ? <>Conecta Outlook en <Link href="/ajustes#correo" className="text-accent underline">Ajustes</Link> y asígnala a este negocio (en Ajustes › Correo de Outlook o en Ajustes › Cuentas sin negocio).</> : "Falta conectar Outlook (mira la guía, Anexo D)."}
        </p>
      )}
      <form action={base} className="flex items-center gap-2 rounded-xl bg-fill px-3">
        <Search className="size-4 shrink-0 text-muted" aria-hidden />
        {f.estado !== "sin_responder" && <input type="hidden" name="estado" value={f.estado} />}
        <input name="q" defaultValue={f.q} placeholder="Buscar persona o texto…" aria-label="Buscar en mensajes" className="min-h-11 w-full bg-transparent text-base outline-none md:text-sm" />
      </form>
      <nav aria-label="Estado" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
        {(["sin_responder", "respondido", "archivado", "todos"] as const).map((e) => <Link key={e} href={href({ estado: e === "sin_responder" ? undefined : e })} className={chip(f.estado === e)}>{MSG_STATUS_LABEL[e]}</Link>)}
      </nav>
      <BusinessMessages businessId={id} items={items} nowMs={requestNowMs()} />
    </div>
  );
}

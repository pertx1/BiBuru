import Link from "next/link";
import { Mail } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MailInbox } from "@/components/mail/mail-inbox";
import { listBusinesses } from "@/lib/data";
import { listMail, mailConfigured } from "@/lib/mail/data";

export const metadata = { title: "Correo" };

type SP = { cuenta?: string; negocio?: string; filtro?: string; q?: string; abrir?: string };

export default async function CorreoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [{ accounts, messages, unread }, businesses] = await Promise.all([
    listMail({ account: sp.cuenta, business: sp.negocio, unread: sp.filtro === "no-leidos", q: sp.q }, 80).catch(() => ({ accounts: [], messages: [], unread: 0 })),
    listBusinesses(),
  ]);
  return (
    <>
      <PageHeader title="Correo" subtitle={accounts.length ? `${unread} sin leer · solo lectura (las respuestas, en Outlook)` : "Tu Outlook dentro de BiBuru, solo lectura."} />
      {accounts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
          <Mail className="size-8 text-muted" aria-hidden />
          {mailConfigured() ? (
            <>
              <p className="font-semibold">Conecta tu cuenta de Outlook</p>
              <p className="max-w-sm text-sm text-muted">Sirven las de Outlook/Hotmail y las de empresa. BiBuru solo lee: no puede enviar ni borrar correos.</p>
              <a href="/api/outlook/connect" className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 font-medium text-accent-foreground">Conectar Outlook</a>
            </>
          ) : (
            <>
              <p className="font-semibold">Falta conectar</p>
              <p className="max-w-sm text-sm text-muted">La app aún no está registrada en Microsoft. Sigue el paso «Correo de Outlook» de la guía <code>docs/QUE-TENGO-QUE-HACER.pdf</code> y vuelve aquí.</p>
            </>
          )}
          <Link href="/ajustes#correo" className="text-sm text-accent">Ajustes de correo</Link>
        </div>
      ) : (
        <MailInbox
          accounts={accounts.map((a) => ({ id: a.id, email: a.email, business_id: a.business_id, status: a.status, last_error: a.last_error }))}
          businesses={businesses.map((b) => ({ id: b.id, name: b.name, color: b.color }))}
          messages={messages} filters={{ cuenta: sp.cuenta ?? "", negocio: sp.negocio ?? "", filtro: sp.filtro ?? "", q: sp.q ?? "" }}
          openId={sp.abrir && /^[0-9a-f-]{36}$/i.test(sp.abrir) ? sp.abrir : null}
        />
      )}
    </>
  );
}

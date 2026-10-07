"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { disconnectMailAccount, setMailAccountBusiness, setMailAi, setMailNotify } from "@/app/(app)/correo/actions";
import { useToast } from "@/components/ui/toast";

type Acc = { id: string; email: string; business_id: string | null; status: string; last_sync_at: string | null; last_error: string | null; notify_new: boolean };
const RESULT: Record<string, string> = {
  ok: "Cuenta conectada ✔ Los correos tardan unos minutos en aparecer.", cancelado: "Has cancelado la conexión.", estado: "La conexión caducó. Vuelve a intentarlo.",
  "sin-token": "Microsoft no dio permiso para seguir conectado. Vuelve a intentarlo.", permisos: "Hay que aceptar el permiso de leer el correo.", error: "No se pudo conectar. Vuelve a intentarlo.",
  "sin-configurar": "Falta conectar: la app no está registrada aún en Microsoft (mira la guía).",
};

/** Ajustes → Correo: conectar varias cuentas, asignar negocio, aviso de correo nuevo (apagado) y permiso de IA (apagado). */
export function MailSettings({ configured, accounts, businesses, aiAllowed, result }: {
  configured: boolean; accounts: Acc[]; businesses: { id: string; name: string }[]; aiAllowed: boolean; result?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) toast({ message: r.error ?? "No se pudo" }); router.refresh(); });
  return (
    <div className="flex flex-col gap-4 text-sm">
      {result && RESULT[result] && <p role="status" className="rounded-lg bg-surface-2 p-3">{RESULT[result]}</p>}
      {!configured ? (
        <p className="rounded-lg border border-dashed border-border p-3"><strong>Falta conectar.</strong> Hay que registrar la app en Microsoft y poner <code>MICROSOFT_CLIENT_ID</code> y <code>MICROSOFT_CLIENT_SECRET</code> en Vercel (lo explica la guía). Mientras, el resto funciona igual.</p>
      ) : (
        <a href="/api/outlook/connect" className="inline-flex min-h-11 items-center self-start rounded-lg bg-accent px-4 font-medium text-accent-foreground md:min-h-9">{accounts.length ? "Conectar otra cuenta" : "Conectar Outlook"}</a>
      )}
      {accounts.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{a.email}</span>
                <span className={a.status === "ok" ? "text-xs text-good" : "text-xs text-danger"}>{a.status === "ok" ? "Conectada" : a.status === "revoked" ? "Hay que reconectar" : "Con errores"}</span>
              </div>
              {a.last_error && <p className="text-xs text-muted">{a.last_error}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted">Negocio
                  <select defaultValue={a.business_id ?? ""} disabled={pending} onChange={(e) => run(() => setMailAccountBusiness(a.id, e.target.value || null))} className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base text-foreground md:min-h-9 md:text-sm">
                    <option value="">Ninguno</option>{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
                <label className="flex min-h-11 items-center gap-2 text-xs text-muted md:min-h-9"><input type="checkbox" className="size-5" checked={a.notify_new} disabled={pending} onChange={(e) => run(() => setMailNotify(a.id, e.target.checked))} /> Avisarme de correo nuevo</label>
                {a.status !== "ok" && <a href="/api/outlook/connect" className="text-xs text-accent underline">Reconectar</a>}
                <button type="button" disabled={pending} onClick={() => { if (confirm(`¿Desconectar ${a.email}? Se borran sus correos de BiBuru (en Outlook no cambia nada).`)) run(() => disconnectMailAccount(a.id)); }} className="min-h-11 text-xs text-muted hover:text-danger md:min-h-9">Desconectar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-lg border border-border p-3">
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={aiAllowed} disabled={pending} onChange={(e) => run(() => setMailAi(e.target.checked))} />
          <span><strong>Usar la IA con mis correos</strong> (apagado)<br /><span className="text-xs text-muted">Si lo activas aparece «Resumir con IA» en cada correo. Al pulsarlo, el texto de ese correo se envía a Google (Gemini) para resumirlo y cuenta en tu presupuesto de IA. Con la API de pago, Google no lo usa para entrenar; con la gratuita, sí puede. Si no lo activas, ningún correo sale de Microsoft y BiBuru.</span></span>
        </label>
      </div>
    </div>
  );
}

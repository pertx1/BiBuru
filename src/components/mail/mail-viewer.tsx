"use client";

import { Check, Download, ExternalLink, ImageIcon, NotebookPen, Reply, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { mailToNote, mailToTask, openMail, summarizeMail, type OpenedMail } from "@/app/(app)/correo/actions";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { mailFrameDoc } from "@/lib/mail/sanitize";

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Lector de un correo: el HTML (ya limpiado en el servidor) va en un iframe aislado sin scripts y sin imágenes remotas
 * hasta pulsar «Mostrar imágenes» (evita píxeles de seguimiento). Responder abre Outlook: BiBuru no envía correos.
 */
export function MailViewer({ id, subject, onClose }: { id: string; subject: string | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [mail, setMail] = useState<OpenedMail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => { let alive = true; openMail(id).then((r) => { if (!alive) return; if (r.ok) setMail(r.mail); else setError(r.error); }); return () => { alive = false; }; }, [id]);

  const act = (fn: () => Promise<{ ok: boolean; error?: string; href?: string }>, msg: string) => start(async () => {
    const r = await fn();
    toast(r.ok ? { message: msg, ...(r.href ? { actionLabel: "Abrir", onAction: () => router.push(r.href!) } : {}) } : { message: r.error ?? "No se pudo" });
  });

  return (
    <Sheet open onClose={onClose} title={subject || "(sin asunto)"} variant="panel">
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : !mail ? <div className="flex flex-col gap-2" aria-busy="true"><div className="skeleton h-5 w-2/3" /><div className="skeleton h-64 w-full" /></div> : (
        <div className="flex flex-col gap-3 text-sm">
          <div className="text-xs text-muted">
            <p><strong className="text-foreground">{mail.from}</strong></p>
            <p className="truncate">Para: {mail.to.join(", ")}{mail.cc.length ? ` · CC: ${mail.cc.join(", ")}` : ""}</p>
            <p>{new Date(mail.date).toLocaleString("es-ES", { dateStyle: "full", timeStyle: "short" })}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={pending} onClick={() => act(() => mailToTask(id), "Tarea creada ✔")}><Check className="size-4" aria-hidden /> Crear tarea</Button>
            <Button variant="secondary" disabled={pending} onClick={() => act(() => mailToNote(id), "Nota guardada ✔")}><NotebookPen className="size-4" aria-hidden /> Guardar como nota</Button>
            {mail.webLink && <a href={mail.webLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium md:min-h-9"><Reply className="size-4" aria-hidden /> Responder en Outlook <ExternalLink className="size-3.5" aria-hidden /></a>}
            {mail.aiAllowed && <Button variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await summarizeMail(id); if (r.ok) setSummary(r.text); else toast({ message: r.error }); })}><Sparkles className="size-4" aria-hidden /> Resumir con IA</Button>}
          </div>
          {summary && <p className="rounded-lg bg-accent/10 p-3 whitespace-pre-line">{summary}</p>}
          {mail.attachments.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {mail.attachments.map((a) => (
                <li key={a.id}><a href={`/api/outlook/attachment?m=${id}&a=${encodeURIComponent(a.id)}&n=${encodeURIComponent(a.name)}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs md:min-h-9">
                  <Download className="size-3.5" aria-hidden /> {a.name} <span className="text-muted">{kb(a.size)}</span></a></li>
              ))}
            </ul>
          )}
          {!images && /<img\b/i.test(mail.html) && <button type="button" onClick={() => setImages(true)} className="inline-flex min-h-11 items-center gap-1.5 self-start text-xs text-accent md:min-h-9"><ImageIcon className="size-3.5" aria-hidden /> Mostrar imágenes (están bloqueadas para que no sepan que lo has abierto)</button>}
          <iframe title="Contenido del correo" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={mailFrameDoc(mail.html, { images, dark: true })}
            className="h-[65dvh] w-full rounded-lg border border-border bg-white" />
        </div>
      )}
    </Sheet>
  );
}

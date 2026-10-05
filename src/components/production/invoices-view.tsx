"use client";

import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteInvoice, saveInvoice } from "@/app/(app)/negocios/actions-production";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { Invoice } from "@/lib/production/data";

export function InvoicesView({ businessId, invoices }: { businessId: string; invoices: Invoice[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Invoice | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cur = editing && editing !== "new" ? editing : null;
  const close = () => { setEditing(null); setError(null); router.refresh(); };

  return (
    <>
      <p className="mb-3 text-sm text-muted">Enlaces a tus facturas (Drive, Dropbox…). No se suben archivos aquí.</p>
      <div className="mb-3"><Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Nueva factura</Button></div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {invoices.map((i) => (
          <li key={i.id} className="flex items-center">
            <button type="button" onClick={() => setEditing(i)} className="min-h-14 flex-1 truncate px-4 text-left text-sm font-medium hover:bg-surface-2">{i.name}</button>
            <a href={i.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${i.name}`} className="flex size-14 items-center justify-center text-muted hover:text-foreground"><ExternalLink className="size-4" aria-hidden /></a>
          </li>
        ))}
        {invoices.length === 0 && <li className="p-6 text-center text-sm text-muted">Sin facturas guardadas.</li>}
      </ul>
      <Sheet open={editing !== null} onClose={close} title={cur ? "Editar factura" : "Nueva factura"}>
        {editing !== null && (
          <form key={cur?.id ?? "new"} className="flex flex-col gap-4" action={(fd) => start(async () => {
            const r = await saveInvoice({ id: cur?.id, businessId, name: String(fd.get("n") ?? ""), url: String(fd.get("u") ?? "") });
            if (r.ok) close(); else setError(r.error);
          })}>
            <Field label="Nombre" htmlFor="inv-n"><Input id="inv-n" name="n" defaultValue={cur?.name ?? ""} maxLength={80} required autoFocus /></Field>
            <Field label="Enlace" htmlFor="inv-u"><Input id="inv-u" name="u" type="url" inputMode="url" defaultValue={cur?.url ?? ""} placeholder="https://…" required /></Field>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending} className="flex-1">Guardar</Button>
              {cur && <Button type="button" variant="secondary" disabled={pending} onClick={() => start(async () => {
                const snap = { businessId, name: cur.name, url: cur.url };
                await deleteInvoice(cur.id); close();
                toast({ message: "Factura eliminada", actionLabel: "Deshacer", onAction: () => void saveInvoice(snap).then(() => router.refresh()) });
              })}><Trash2 className="size-4" aria-hidden /> Eliminar</Button>}
            </div>
          </form>
        )}
      </Sheet>
    </>
  );
}

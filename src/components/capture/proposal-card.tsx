"use client";

import { Check, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptProposal, discardInbox, restoreInbox } from "@/app/(app)/bandeja/actions";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { KINDS, type Kind, type Proposal } from "@/lib/ai/classify";
import { formatDate } from "@/lib/dates";
import { formatEUR } from "@/lib/money";

const KIND_LABEL: Record<Kind, string> = { task: "Tarea", note: "Nota", idea: "Idea", expense: "Gasto", order: "Pedido", event: "Evento", goal: "Objetivo", link: "Enlace" };
type Biz = { id: string; name: string };

/** Propuesta de la IA para una captura: se acepta con un toque, se corrige o se descarta. Dinero: siempre «Confirmar». */
export function ProposalCard({ id, text, proposal, businesses, categories }: { id: string; text: string; proposal: Proposal; businesses: Biz[]; categories: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Proposal>(proposal);
  const [error, setError] = useState<string | null>(null);
  const money = proposal.kind === "expense" || proposal.kind === "order";

  const accept = (p?: Proposal) =>
    start(async () => {
      const r = await acceptProposal(id, p);
      if (!r.ok) { setError(r.error); return; }
      setEditing(false);
      toast({ message: money ? `${KIND_LABEL[proposal.kind]} guardado` : `Guardado como ${KIND_LABEL[(p ?? proposal).kind].toLowerCase()}`, actionLabel: "Deshacer", onAction: () => void restoreInbox(id, r.created).then(() => router.refresh()) });
      router.refresh();
    });

  const p = proposal;
  const biz = p.business;
  return (
    <div className="mt-3 rounded-xl border border-accent/30 bg-accent/5 p-3">
      <p className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-full bg-accent px-2 py-0.5 font-semibold text-accent-foreground">{KIND_LABEL[p.kind]}</span>
        {p.confidence < 0.6 && <span className="text-amber-700 dark:text-amber-400">Poco segura: revísalo</span>}
        {biz && <span className="rounded-full border border-border bg-surface px-2 py-0.5">{biz}</span>}
        {p.date && <span className="rounded-full border border-border bg-surface px-2 py-0.5">{formatDate(p.date)}{p.time ? ` ${p.time}` : ""}</span>}
        {p.tags.map((t) => <span key={t} className="text-muted">#{t}</span>)}
      </p>
      <p className="mt-1.5 text-sm font-medium">{p.kind === "expense" && p.expense ? `${formatEUR(Math.round(p.expense.amount_eur * 100))} · ${p.expense.concept ?? p.title}${p.expense.category ? ` · ${p.expense.category}` : ""}` : p.kind === "order" && p.order ? `${p.order.items.map((i) => `${i.quantity}× ${i.product}`).join(", ")}${p.order.customer ? ` · ${p.order.customer}` : ""}` : p.title}</p>
      {p.kind === "order" && p.order && p.order.items.some((i) => i.unit_price_eur !== null) && <p className="text-xs text-muted">Total: {formatEUR(Math.round(p.order.items.reduce((s, i) => s + i.quantity * (i.unit_price_eur ?? 0), 0) * 100))}</p>}
      {money && <p className="mt-1 text-xs text-muted">Los gastos y pedidos los confirmas tú antes de guardarse.</p>}
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button onClick={() => accept()} disabled={pending}><Check className="size-4" aria-hidden /> {money ? "Confirmar y guardar" : "Aceptar"}</Button>
        <Button variant="secondary" onClick={() => { setDraft(proposal); setEditing(true); }} disabled={pending}><Pencil className="size-4" aria-hidden /> Corregir</Button>
        <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await discardInbox(id); toast({ message: "Descartada", actionLabel: "Deshacer", onAction: () => void restoreInbox(id).then(() => router.refresh()) }); router.refresh(); })}><Trash2 className="size-4" aria-hidden /> Descartar</Button>
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Corregir propuesta">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); accept(draft); }}>
          <p className="rounded-lg bg-surface-2 p-2 text-xs text-muted">Captura original: {text}</p>
          <Field label="Tipo" htmlFor="pc-kind"><Select id="pc-kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Kind })}>{KINDS.filter((k) => k !== "link" || draft.kind === "link").map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</Select></Field>
          <Field label="Título" htmlFor="pc-title"><Input id="pc-title" value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required /></Field>
          <Field label="Negocio" htmlFor="pc-biz"><Select id="pc-biz" value={draft.business ?? ""} onChange={(e) => setDraft({ ...draft, business: e.target.value || null })}><option value="">Ninguno</option>{businesses.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha" htmlFor="pc-date"><Input id="pc-date" type="date" value={draft.date ?? ""} onChange={(e) => setDraft({ ...draft, date: e.target.value || null })} /></Field>
            <Field label="Hora" htmlFor="pc-time"><Input id="pc-time" type="time" value={draft.time ?? ""} onChange={(e) => setDraft({ ...draft, time: e.target.value || null })} /></Field>
          </div>
          {draft.kind === "expense" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Importe (€)" htmlFor="pc-amt"><Input id="pc-amt" inputMode="decimal" value={draft.expense?.amount_eur ?? ""} onChange={(e) => setDraft({ ...draft, expense: { amount_eur: Number(e.target.value.replace(",", ".")) || 0, concept: draft.expense?.concept ?? null, category: draft.expense?.category ?? null, supplier: draft.expense?.supplier ?? null, payment_method: draft.expense?.payment_method ?? null } })} /></Field>
              <Field label="Categoría" htmlFor="pc-cat"><Select id="pc-cat" value={draft.expense?.category ?? ""} onChange={(e) => draft.expense && setDraft({ ...draft, expense: { ...draft.expense, category: e.target.value || null } })}><option value="">Sin categoría</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
            </div>
          )}
          <Field label="Etiquetas (separadas por comas)" htmlFor="pc-tags"><Input id="pc-tags" value={draft.tags.join(", ")} onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6) })} /></Field>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={pending}><Check className="size-4" aria-hidden /> Guardar así</Button>
        </form>
      </Sheet>
    </div>
  );
}

export function RetryAi({ id, error, onRetry }: { id: string; error: string | null; onRetry: (id: string) => Promise<{ ok: boolean; error?: string }> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
      {error ? `La IA no pudo clasificarla (${error.slice(0, 60)}).` : "Sin clasificar por la IA."}
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await onRetry(id); setMsg(r.ok ? null : (r.error ?? "Error")); router.refresh(); })} className="inline-flex min-h-11 md:min-h-9 items-center gap-1 text-accent underline"><RotateCcw className="size-3" aria-hidden /> Reintentar</button>
      {msg && <span role="alert" className="text-danger">{msg}</span>}
    </p>
  );
}

"use client";

import { Check, ExternalLink, Plus, Send, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { cancelChatAction, confirmChatAction, sendChat, type ChatMessage } from "@/app/(app)/chat/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VoiceButton } from "./voice-button";

const SUGGESTIONS = ["¿Qué tengo mañana?", "¿Cuánto beneficio llevo este mes en cada negocio?", "Apunta un gasto de 35 € en transfers", "Recuérdame el viernes a las 9 pedir presupuesto", "Guarda esta idea: pack de verano con tote bag"];

export function ChatView({ conversationId: initialId, initial, autoSend }: { conversationId: string; initial: ChatMessage[]; autoSend?: string }) {
  const [conversationId, setConversationId] = useState(initialId);
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, pending]);
  // Pregunta que llega desde Inicio (?q=): se envía una sola vez y se limpia la dirección para no repetirla al recargar.
  const autoSent = useRef(false);
  useEffect(() => {
    if (!autoSend || autoSent.current) return;
    autoSent.current = true;
    window.history.replaceState(null, "", "/chat");
    send(autoSend);
  });

  function send(value: string) {
    const v = value.trim();
    if (!v || pending) return;
    setText(""); setError(null);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: v, links: [], pending: null, actionStatus: null }]);
    start(async () => {
      const r = await sendChat(conversationId, v);
      if (!r.ok) { setError(r.error); return; }
      setMessages((m) => [...m.filter((x) => !x.id.startsWith("tmp-")), r.user, r.assistant]);
    });
  }

  function confirm(m: ChatMessage) {
    setBusy(m.id);
    start(async () => {
      const r = await confirmChatAction(m.id);
      setBusy(null);
      if (!r.ok) { setError(r.error); return; }
      setMessages((all) => all.map((x) => (x.id === m.id ? { ...x, actionStatus: "done", links: [...x.links, r.link] } : x)));
    });
  }
  function cancel(m: ChatMessage) {
    setMessages((all) => all.map((x) => (x.id === m.id ? { ...x, actionStatus: "cancelled" } : x)));
    start(async () => { await cancelChatAction(m.id); });
  }

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-col md:min-h-[calc(100dvh-10rem)]">
      <div className="flex-1 space-y-3 pb-4">
        {messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-5">
            <p className="flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4 text-accent" aria-hidden /> Pregúntame por tus tareas, tus negocios o dime qué apuntar.</p>
            <div className="mt-3 flex flex-wrap gap-2">{SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => send(s)} className="min-h-11 md:min-h-10 rounded-full border border-border bg-surface px-3 text-left text-sm hover:bg-surface-2">{s}</button>)}</div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm", m.role === "user" ? "bg-accent text-accent-foreground" : "border border-border bg-surface")}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.links.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">{m.links.map((l) => <Link key={l.kind + l.id} href={l.href} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-accent/10 px-2.5 text-xs font-medium text-accent"><ExternalLink className="size-3" aria-hidden />{l.label}</Link>)}</div>
              )}
              {m.pending && (
                <div className="mt-2 rounded-xl border border-border bg-background p-3" role="group" aria-label="Confirmación">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{m.actionStatus === "done" ? "Guardado" : m.actionStatus === "cancelled" ? "Cancelado" : "Confirma antes de guardar"}</p>
                  <p className="mt-1 text-sm">{m.pending.summary}</p>
                  {m.actionStatus === "pending" && (
                    <div className="mt-2 flex gap-2">
                      <Button onClick={() => confirm(m)} disabled={busy === m.id}><Check className="size-4" aria-hidden /> Confirmar</Button>
                      <Button variant="secondary" onClick={() => cancel(m)} disabled={busy === m.id}><X className="size-4" aria-hidden /> Cancelar</Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {pending && !busy && <div className="flex justify-start"><div className="rounded-2xl border border-border bg-surface px-4 py-3" aria-label="Escribiendo"><span className="inline-flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 120}ms` }} />)}</span></div></div>}
        <div ref={end} />
      </div>

      {error && <p role="alert" className="mb-2 text-sm text-danger">{error}</p>}
      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-sm md:bottom-4">
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={4000} aria-label="Mensaje" placeholder="Escribe o dicta…" enterKeyHint="send"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }}
          className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base outline-none md:text-sm"
        />
        <VoiceButton onText={(t) => setText((x) => (x ? `${x} ${t}` : t))} onError={setError} />
        <button type="submit" disabled={!text.trim() || pending} aria-label="Enviar" className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground disabled:opacity-50 md:size-9"><Send className="size-4" aria-hidden /></button>
      </form>
      {messages.length > 0 && <button type="button" onClick={() => { setConversationId(crypto.randomUUID()); setMessages([]); setError(null); }} className="mt-2 inline-flex min-h-11 md:min-h-10 items-center gap-1.5 self-start text-xs text-muted hover:text-foreground"><Plus className="size-3.5" aria-hidden /> Nueva conversación</button>}
    </div>
  );
}

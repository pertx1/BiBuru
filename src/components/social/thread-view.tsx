"use client";

import { Archive, ClipboardList, ExternalLink, Eye, EyeOff, Inbox, NotebookPen, RotateCcw, ShoppingBag, Sparkles, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteReply, hideComment, linkThread, replyThread, retrySend, saveReply, setThreadLabels, setThreadStatus, suggestReply, threadOrderLink, threadToNote, threadToTask } from "@/app/(app)/redes/inbox-actions";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { Capabilities } from "@/lib/inbox/logic";
import { LABELS, STATUS_LABEL } from "@/lib/inbox/logic";
import { cn } from "@/lib/utils";
import { InboxLive } from "./inbox-live";

type Thread = { id: string; kind: string; platform: string; status: string; labels: string[]; participant_username: string | null; participant_name: string | null; customer_name: string | null; order_id: string | null; media_permalink: string | null; media_caption: string | null; media_thumbnail: string | null };
type Msg = { id: string; direction: string; author_name: string | null; body: string; sent_at: string; send_status: string | null; send_mode: string | null; error: string | null; hidden: boolean; attachments: unknown; external_id: string | null };
type Reply = { id: string; title: string; body: string; business_id: string | null };

const fmt = (iso: string) => new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));

/** Conversación completa con respuesta (estados enviando / enviado / error con reintento) y acciones. */
export function ThreadView({ thread, messages, accountUsername, businessId, window, capabilities, savedReplies, aiEnabled, orders }: {
  thread: Thread; messages: Msg[]; accountUsername: string | null; businessId: string | null; window: { open: boolean; label: string } | null;
  capabilities: Capabilities; savedReplies: Reply[]; aiEnabled: boolean; orders: { id: string; label: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"dm" | "public" | "private">(thread.kind === "dm" ? "dm" : "public");
  const [replyOpen, setReplyOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [labels, setLabels] = useState(thread.labels);
  const [newLabel, setNewLabel] = useState("");
  const name = thread.customer_name ?? (thread.participant_username ? `@${thread.participant_username}` : thread.participant_name ?? "Instagram");
  const canReply = thread.kind === "dm" ? capabilities.replyDm && !!window?.open : thread.kind === "comment" ? capabilities.replyComment : false;
  const run = (fn: () => Promise<{ ok: boolean; error?: string; href?: string }>, ok?: string, go?: boolean) => start(async () => {
    const r = await fn();
    if (!r.ok) return toast({ message: r.error ?? "No se pudo" });
    if (ok) toast({ message: ok, ...(r.href && !go ? { actionLabel: "Abrir", onAction: () => router.push(r.href!) } : {}) });
    if (go && r.href) router.push(r.href); else router.refresh();
  });
  const send = () => { const t = text; setText(""); start(async () => { const r = await replyThread(thread.id, t, mode); if (!r.ok) { setText(t); toast({ message: r.error }); } else toast({ message: "Enviado ✓", durationMs: 2500 }); router.refresh(); }); };

  return (
    <div className="flex flex-col gap-4 pb-6">
      <InboxLive intervalMs={30_000} />
      <header>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{name}</h1>
        <p className="mt-1 text-sm text-muted">{thread.platform === "tiktok" ? "TikTok" : "Instagram"} · @{accountUsername ?? "cuenta"} · {thread.kind === "dm" ? "Mensaje directo" : thread.kind === "comment" ? "Comentario" : "Mención"} · {STATUS_LABEL[thread.status as keyof typeof STATUS_LABEL]}</p>
        {labels.length > 0 && <p className="mt-1.5 flex flex-wrap gap-1.5">{labels.map((l) => <span key={l} className="rounded-full bg-fill px-2 py-0.5 text-xs">#{l}</span>)}</p>}
      </header>

      {(thread.kind !== "dm") && (thread.media_thumbnail || thread.media_caption || thread.media_permalink) && (
        <a href={thread.media_permalink ?? "https://www.instagram.com/"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl bg-surface p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- miniatura externa */}
          {thread.media_thumbnail ? <img src={thread.media_thumbnail} alt="" className="size-14 shrink-0 rounded-lg object-cover" referrerPolicy="no-referrer" loading="lazy" /> : <span className="size-14 shrink-0 rounded-lg bg-fill" />}
          <span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm">{thread.media_caption || "Publicación"}</span><span className="mt-0.5 inline-flex items-center gap-1 text-xs text-accent">Ver publicación <ExternalLink className="size-3" aria-hidden /></span></span>
        </a>
      )}

      <ol className="flex flex-col gap-2" aria-label="Mensajes">
        {messages.map((m) => {
          const out = m.direction === "out";
          const atts = Array.isArray(m.attachments) ? (m.attachments as { type: string; url: string }[]) : [];
          return (
            <li key={m.id} className={cn("flex flex-col gap-0.5", out ? "items-end" : "items-start")}>
              <div className={cn("max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px]", out ? "bg-accent text-accent-foreground" : "bg-surface", m.hidden && "opacity-50")}>
                {!out && thread.kind === "comment" && m.author_name && <span className="mb-0.5 block text-xs font-semibold opacity-80">@{m.author_name}</span>}
                {m.body || (atts.length ? "" : "—")}
                {atts.map((a, i) => <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-xs underline">📎 {a.type.startsWith("image") ? "Imagen" : a.type.startsWith("video") ? "Vídeo" : "Adjunto"}</a>)}
              </div>
              <span className="flex items-center gap-2 px-1 text-[11px] text-muted">
                {fmt(m.sent_at)}
                {out && m.send_mode === "private" && " · privado"}
                {m.send_status === "enviando" && " · Enviando…"}
                {m.send_status === "error" && <span className="text-danger">· Error: {m.error}</span>}
                {m.send_status === "error" && <button type="button" disabled={pending} onClick={() => run(() => retrySend(m.id), "Enviado ✓")} className="inline-flex min-h-9 items-center gap-1 font-semibold text-accent"><RotateCcw className="size-3" aria-hidden />Reintentar</button>}
                {m.hidden && " · oculto"}
                {!out && thread.kind === "comment" && capabilities.hideComment && m.external_id && !m.external_id.startsWith("local:") && (
                  <button type="button" disabled={pending} onClick={() => run(() => hideComment(m.id, !m.hidden), m.hidden ? "Comentario visible" : "Comentario oculto")} className="inline-flex min-h-9 items-center gap-1 text-muted hover:text-foreground">
                    {m.hidden ? <><Eye className="size-3" aria-hidden />Mostrar</> : <><EyeOff className="size-3" aria-hidden />Ocultar</>}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Responder */}
      <section aria-label="Responder" className="flex flex-col gap-2 rounded-2xl bg-surface p-3">
        {thread.kind === "dm" && window && <p className={cn("text-xs font-medium", window.open ? "text-muted" : "text-danger")}>{window.label}</p>}
        {canReply ? (
          <>
            {thread.kind === "comment" && (
              <div className="flex gap-1.5" role="radiogroup" aria-label="Tipo de respuesta">
                <button type="button" role="radio" aria-checked={mode === "public"} onClick={() => setMode("public")} className={cn("min-h-11 flex-1 rounded-full text-sm font-semibold md:min-h-9", mode === "public" ? "bg-accent text-accent-foreground" : "bg-fill")}>En público</button>
                {capabilities.privateReply && <button type="button" role="radio" aria-checked={mode === "private"} onClick={() => setMode("private")} className={cn("min-h-11 flex-1 rounded-full text-sm font-semibold md:min-h-9", mode === "private" ? "bg-accent text-accent-foreground" : "bg-fill")}>Mensaje privado</button>}
              </div>
            )}
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "public" ? "Responder al comentario…" : "Escribe tu respuesta…"} aria-label="Respuesta" maxLength={1000} className="min-h-20" />
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending || !text.trim()} onClick={send}>{pending ? "Enviando…" : "Enviar"}</Button>
              {savedReplies.length > 0 && (
                <Select aria-label="Respuestas guardadas" value="" onChange={(e) => { const r = savedReplies.find((x) => x.id === e.target.value); if (r) setText((t) => (t ? `${t}\n${r.body}` : r.body)); }} className="w-auto flex-1 md:flex-none">
                  <option value="">Respuestas guardadas…</option>{savedReplies.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                </Select>
              )}
              <Button variant="secondary" onClick={() => setReplyOpen(true)}>Guardar respuestas</Button>
              {aiEnabled && <Button variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await suggestReply(thread.id); if (r.ok) setText(r.text); else toast({ message: r.error }); })}><Sparkles className="size-4" aria-hidden />Sugerir respuesta</Button>}
            </div>
            <p className="text-xs text-muted">Nada se envía solo: revisa y pulsa «Enviar».</p>
          </>
        ) : (
          <a href={thread.kind === "dm" ? capabilities.openDmsUrl ?? "https://www.instagram.com/direct/inbox/" : thread.media_permalink ?? "https://www.instagram.com/"} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-full bg-fill px-4 text-sm font-semibold md:min-h-9">
            Abrir en {thread.platform === "tiktok" ? "TikTok" : "Instagram"} <ExternalLink className="size-4" aria-hidden />
          </a>
        )}
      </section>

      {/* Acciones */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Button variant="secondary" disabled={pending} onClick={() => run(() => threadOrderLink(thread.id), undefined, true)}><ShoppingBag className="size-4" aria-hidden />Crear pedido</Button>
        <Button variant="secondary" disabled={pending} onClick={() => run(() => threadToTask(thread.id), "Tarea creada")}><ClipboardList className="size-4" aria-hidden />Crear tarea</Button>
        <Button variant="secondary" disabled={pending} onClick={() => run(() => threadToNote(thread.id), "Guardada como nota")}><NotebookPen className="size-4" aria-hidden />Guardar nota</Button>
        <Button variant="secondary" disabled={pending} onClick={() => setLabelsOpen(true)}><Tag className="size-4" aria-hidden />Etiquetas</Button>
        {thread.status !== "archivado"
          ? <Button variant="secondary" disabled={pending} onClick={() => run(() => setThreadStatus(thread.id, "archivado"), "Archivado")}><Archive className="size-4" aria-hidden />Archivar</Button>
          : <Button variant="secondary" disabled={pending} onClick={() => run(() => setThreadStatus(thread.id, "sin_responder"), "Movido a sin responder")}><Inbox className="size-4" aria-hidden />Desarchivar</Button>}
        {thread.status === "sin_responder"
          ? <Button variant="secondary" disabled={pending} onClick={() => run(() => setThreadStatus(thread.id, "respondido"), "Marcado como respondido")}>Ya respondido</Button>
          : <Button variant="secondary" disabled={pending} onClick={() => run(() => setThreadStatus(thread.id, "sin_responder"), "Marcado sin responder")}>Sin responder</Button>}
      </div>

      {/* Vincular */}
      <section aria-label="Vincular" className="flex flex-col gap-2 rounded-2xl bg-surface p-3">
        <h2 className="text-sm font-semibold">Vincular</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get("c") ?? ""); run(() => linkThread(thread.id, { customerName: v }), "Cliente guardado"); }}>
          <Input name="c" defaultValue={thread.customer_name ?? ""} placeholder="Nombre del cliente" aria-label="Cliente" maxLength={200} />
          <Button type="submit" variant="secondary" disabled={pending}>Guardar</Button>
        </form>
        {businessId && (
          <Select aria-label="Pedido vinculado" defaultValue={thread.order_id ?? ""} onChange={(e) => run(() => linkThread(thread.id, { orderId: e.target.value || null }), "Pedido vinculado")}>
            <option value="">Sin pedido vinculado</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
        )}
        {thread.order_id && businessId && <a href={`/negocios/${businessId}/pedidos?abrir=${thread.order_id}`} className="text-sm font-semibold text-accent">Abrir el pedido</a>}
      </section>

      <Sheet open={labelsOpen} onClose={() => setLabelsOpen(false)} title="Etiquetas">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {[...new Set([...LABELS, ...labels])].map((l) => {
              const on = labels.includes(l);
              return <button key={l} type="button" aria-pressed={on} onClick={() => setLabels(on ? labels.filter((x) => x !== l) : [...labels, l])} className={cn("min-h-11 rounded-full px-3 text-sm md:min-h-9", on ? "bg-accent text-accent-foreground" : "bg-fill")}>#{l}</button>;
            })}
          </div>
          <div className="flex gap-2"><Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Etiqueta nueva" aria-label="Etiqueta nueva" maxLength={30} /><Button variant="secondary" disabled={!newLabel.trim()} onClick={() => { setLabels([...labels, newLabel.trim().toLowerCase()]); setNewLabel(""); }}>Añadir</Button></div>
          <Button disabled={pending} onClick={() => { setLabelsOpen(false); run(() => setThreadLabels(thread.id, labels), "Etiquetas guardadas"); }}>Guardar etiquetas</Button>
        </div>
      </Sheet>

      <Sheet open={replyOpen} onClose={() => setReplyOpen(false)} title="Respuestas guardadas">
        <div className="flex flex-col gap-3">
          {savedReplies.length > 0 && (
            <ul className="flex flex-col gap-2">
              {savedReplies.map((r) => (
                <li key={r.id} className="flex items-start gap-2 rounded-xl bg-fill p-3 text-sm">
                  <span className="min-w-0 flex-1"><strong>{r.title}</strong>{!r.business_id && <span className="text-xs text-muted"> · todas</span>}<span className="block whitespace-pre-wrap text-muted">{r.body}</span></span>
                  <button type="button" onClick={() => run(() => deleteReply(r.id), "Borrada")} className="min-h-11 px-2 text-xs text-muted hover:text-danger md:min-h-9">Borrar</button>
                </li>
              ))}
            </ul>
          )}
          <form className="flex flex-col gap-2" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const form = e.currentTarget;
            run(async () => { const r = await saveReply({ title: String(fd.get("t") ?? ""), body: String(fd.get("b") ?? ""), businessId: fd.get("all") ? null : businessId }); if (r.ok) form.reset(); return r; }, "Respuesta guardada");
          }}>
            <Input name="t" placeholder="Nombre (p. ej. «Envíos»)" aria-label="Nombre de la respuesta" maxLength={80} required />
            <Textarea name="b" placeholder="Texto de la respuesta" aria-label="Texto de la respuesta" maxLength={1000} required className="min-h-20" defaultValue={text} />
            {businessId && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="all" className="size-5" /> Para todos los negocios</label>}
            <Button type="submit" disabled={pending}>Guardar respuesta</Button>
          </form>
        </div>
      </Sheet>
    </div>
  );
}

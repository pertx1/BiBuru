"use client";

import { CheckSquare, FileText, Link2, Mic, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { acceptInboxAsNote, acceptInboxAsTask, discardInbox, restoreInbox } from "@/app/(app)/bandeja/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatDate, todayISO } from "@/lib/dates";
import type { InboxItem } from "@/lib/notes/data";
import { extractUrl } from "@/lib/notes/schemas";
import { dueLabel } from "@/lib/tasks/format";
import { parseQuickTask } from "@/lib/tasks/quick-parse";
import { describeRecurrence } from "@/lib/tasks/recurrence";

function when(iso: string, today: string) {
  const d = new Date(iso);
  const day = todayISO(d);
  const t = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(d);
  return day === today ? `hoy ${t}` : `${formatDate(day)} ${t}`;
}

export function InboxList({ items, today, nowTime }: { items: InboxItem[]; today: string; nowTime: string }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [gone, setGone] = useState<string[]>([]);
  const visible = useMemo(() => items.filter((i) => !gone.includes(i.id)), [items, gone]);

  function act(item: InboxItem, kind: "task" | "note" | "discard") {
    setGone((g) => [...g, item.id]);
    start(async () => {
      const r = kind === "task" ? await acceptInboxAsTask(item.id) : kind === "note" ? await acceptInboxAsNote(item.id) : await discardInbox(item.id);
      if (!r.ok) { setGone((g) => g.filter((x) => x !== item.id)); toast({ message: r.error }); return; }
      const created = ("created" in r ? r.created : undefined) as { kind: "task" | "note"; id: string } | undefined;
      toast({
        message: kind === "task" ? "Convertida en tarea" : kind === "note" ? "Guardada como nota" : "Descartada", actionLabel: "Deshacer",
        onAction: () => { setGone((g) => g.filter((x) => x !== item.id)); void restoreInbox(item.id, created).then(() => router.refresh()); },
      });
      router.refresh();
    });
  }

  if (visible.length === 0) {
    return <div className="rounded-xl border border-dashed border-border p-10 text-center"><p className="font-semibold">Bandeja vacía ✔</p><p className="mt-1 text-sm text-muted">Todo lo que apuntes con el botón + aparecerá aquí para clasificarlo con un toque.</p></div>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {visible.map((item) => {
        const url = extractUrl(item.raw_text);
        const q = parseQuickTask(item.raw_text, today, nowTime);
        const due = q.date ? dueLabel(q.date, q.time, today).text : "";
        return (
          <li key={item.id} className="rounded-xl border border-border bg-surface p-4">
            <p className="whitespace-pre-wrap break-words text-sm">{item.raw_text}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              {item.source === "voice" ? <Mic className="size-3.5" aria-hidden /> : url ? <Link2 className="size-3.5" aria-hidden /> : null}
              {when(item.captured_at, today)}
              {item.status === "processing" && " · clasificando…"}
            </p>
            {!url && (due || q.recurrence) && (
              <p className="mt-2 text-xs text-muted">Como tarea: <span className="font-medium text-foreground">{q.title}</span>{due && <> · {due}</>}{q.recurrence && <> · {describeRecurrence(q.recurrence)}</>}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => act(item, "task")}><CheckSquare className="size-4" aria-hidden /> Tarea</Button>
              <Button variant="secondary" onClick={() => act(item, "note")}><FileText className="size-4" aria-hidden /> Nota</Button>
              <Button variant="ghost" onClick={() => act(item, "discard")}><Trash2 className="size-4" aria-hidden /> Descartar</Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

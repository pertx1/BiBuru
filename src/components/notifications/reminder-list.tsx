"use client";

import { Bell, Check, Clock, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeReminder, deleteReminder, snoozeReminder } from "@/app/(app)/aviso/actions";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/dates";

type R = { id: string; title: string; local: { date: string; time: string }; status: string };

/** Recordatorios sueltos: ✓ lo resuelve, el reloj lo pospone 1 h. */
export function ReminderList({ reminders, today }: { reminders: R[]; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const [gone, setGone] = useState<string[]>([]);
  const [, start] = useTransition();
  const list = reminders.filter((r) => !gone.includes(r.id));
  if (list.length === 0) return null;
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  return (
    <section aria-label="Recordatorios" className="mb-5">
      <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Recordatorios · {list.length}</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {list.map((r) => (
          <li key={r.id} className="flex items-center gap-1 pl-3">
            <Bell className="size-4 shrink-0 text-accent" aria-hidden />
            <span className="min-w-0 flex-1 py-2.5 pl-2"><span className="block truncate text-sm font-medium">{r.title}</span>
              <span className="text-xs text-muted">{r.local.date === today ? "Hoy" : formatDate(r.local.date)} {r.local.time}{r.status === "sent" && " · avisado"}</span></span>
            <button type="button" aria-label="Posponer 1 hora" className="flex size-11 items-center justify-center text-muted hover:text-foreground" onClick={() => run(() => snoozeReminder(r.id, "1h"))}><Clock className="size-4" aria-hidden /></button>
            <button type="button" aria-label="Hecho" className="flex size-11 items-center justify-center text-muted hover:text-emerald-600" onClick={() => { setGone((g) => [...g, r.id]); run(() => completeReminder(r.id)); }}><Check className="size-4" aria-hidden /></button>
            <button type="button" aria-label="Eliminar recordatorio" className="flex size-11 items-center justify-center text-muted hover:text-danger" onClick={() => { setGone((g) => [...g, r.id]); run(() => deleteReminder(r.id)); toast({ message: "Recordatorio eliminado" }); }}><Trash2 className="size-4" aria-hidden /></button>
          </li>
        ))}
      </ul>
    </section>
  );
}

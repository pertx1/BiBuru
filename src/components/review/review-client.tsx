"use client";

import { Check, CheckCircle2, ChevronRight, Clock, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markOrderPaid } from "@/app/(app)/negocios/payments-actions";
import { reviewAiSummary, savePriorities, setReviewed } from "@/app/(app)/revision/actions";
import { completeTask, moveToTomorrow, restoreDueDate, uncompleteTask } from "@/app/(app)/tareas/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatEUR } from "@/lib/money";
import type { OrderRef, TaskRef } from "@/lib/review/build";
import { PRIORITY_META } from "@/lib/tasks/input";
import { cn } from "@/lib/utils";

/** Tareas de la revisión: completar (con «Deshacer»), pasar a mañana o abrir, sin salir de aquí. */
export function ReviewTasks({ tasks, empty, showDate = false }: { tasks: TaskRef[]; empty: string; showDate?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [gone, setGone] = useState<string[]>([]);
  const shown = tasks.filter((t) => !gone.includes(t.id));
  const hide = (id: string) => setGone((g) => [...g, id]);
  const unhide = (id: string) => setGone((g) => g.filter((x) => x !== id));
  if (!shown.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {shown.map((t) => (
        <li key={t.id} className="flex min-h-12 items-center gap-1">
          <button type="button" aria-label={`Completar «${t.title}»`} className="flex size-11 shrink-0 items-center justify-center"
            onClick={() => { hide(t.id); start(async () => {
              const r = await completeTask(t.id);
              if (!r.ok) { unhide(t.id); toast({ message: r.error }); return; }
              toast({ message: "¡Hecho! ✓", actionLabel: "Deshacer", durationMs: 5000, onAction: () => { unhide(t.id); void uncompleteTask(t.id).then(() => router.refresh()); } });
            }); }}>
            <span className={cn("flex size-5 items-center justify-center rounded-full border-2", PRIORITY_META[t.priority]?.ring ?? "border-muted/60")}><Check className="size-3 opacity-0" aria-hidden /></span>
          </button>
          <Link href={`/tareas/${t.id}`} className="min-w-0 flex-1 truncate text-sm">{t.title}{showDate && t.dueDate ? <span className="ml-1.5 text-xs text-muted">· {t.dueDate.split("-").reverse().join("/")}</span> : null}</Link>
          <button type="button" aria-label={`Posponer «${t.title}» a mañana`} title="Mañana" className="flex size-11 shrink-0 items-center justify-center text-muted hover:text-foreground"
            onClick={() => { hide(t.id); start(async () => {
              const r = await moveToTomorrow(t.id);
              if (!r.ok) { unhide(t.id); toast({ message: r.error }); return; }
              toast({ message: "Para mañana", actionLabel: "Deshacer", onAction: () => { unhide(t.id); void restoreDueDate(t.id, r.previous).then(() => router.refresh()); } });
            }); }}>
            <Clock className="size-4" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Pendiente de cobro: marcar cobrado desde la revisión. */
export function ReviewReceivables({ orders }: { orders: OrderRef[] }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [paid, setPaid] = useState<string[]>([]);
  const shown = orders.filter((o) => !paid.includes(o.id));
  if (!shown.length) return <p className="text-sm text-muted">Nadie te debe nada. 🎉</p>;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {shown.map((o) => (
        <li key={o.id} className="flex min-h-12 items-center gap-2 text-sm">
          <Link href={`/negocios/${o.businessId}/pedidos?abrir=${o.id}`} className="min-w-0 flex-1 truncate">{o.label}</Link>
          <span className="shrink-0 tabular-nums text-bad">{formatEUR(o.dueCents ?? 0)}</span>
          <button type="button" disabled={busy} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-fill px-3 text-xs font-medium text-good md:min-h-9"
            onClick={() => start(async () => { const r = await markOrderPaid(o.id); if (r.ok) { setPaid((p) => [...p, o.id]); toast({ message: "Marcado como cobrado" }); router.refresh(); } else toast({ message: r.error }); })}>
            <Check className="size-4" aria-hidden /> Cobrado
          </button>
        </li>
      ))}
    </ul>
  );
}

/** «Revisado»: cierra la revisión (deja de salir en Inicio). */
export function ReviewedButton({ id, reviewedAt }: { id: string; reviewedAt: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  if (reviewedAt) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-good/10 p-3 text-sm">
        <CheckCircle2 className="size-5 text-good" aria-hidden /><span className="flex-1">Revisada el {new Date(reviewedAt).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}</span>
        <button type="button" disabled={busy} className="min-h-11 text-xs text-muted underline md:min-h-9" onClick={() => start(async () => { await setReviewed(id, false); router.refresh(); })}>Reabrir</button>
      </div>
    );
  }
  return (
    <Button disabled={busy} onClick={() => start(async () => { const r = await setReviewed(id, true); toast({ message: r.ok ? "Revisión cerrada ✓" : r.error }); router.refresh(); })} className="w-full">
      <CheckCircle2 className="size-4" aria-hidden /> Revisado
    </Button>
  );
}

/** Semanal: 3 prioridades para la semana siguiente (se crean como tareas). */
export function PrioritiesForm({ id, initial }: { id: string; initial: string[] }) {
  const toast = useToast();
  const router = useRouter();
  const [items, setItems] = useState([0, 1, 2].map((i) => initial[i] ?? ""));
  const [busy, start] = useTransition();
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => {
      const r = await savePriorities(id, items);
      toast({ message: r.ok ? (r.created ? `${r.created} ${r.created === 1 ? "tarea creada" : "tareas creadas"} para la semana que viene` : "Prioridades guardadas") : r.error });
      router.refresh();
    }); }}>
      {items.map((v, i) => (
        <Input key={i} value={v} maxLength={200} placeholder={`Prioridad ${i + 1}`} aria-label={`Prioridad ${i + 1}`} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))} />
      ))}
      <Button type="submit" variant="secondary" disabled={busy || items.every((x) => !x.trim())}>Crear como tareas</Button>
    </form>
  );
}

/** Párrafo de resumen con IA (opcional; gasta un poco del presupuesto). */
export function ReviewAi({ id, initial, configured }: { id: string; initial: string | null; configured: boolean }) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  if (text) return <p className="whitespace-pre-line text-sm">{text}</p>;
  if (!configured) return <p className="text-xs text-muted">Resumen con IA: falta conectar (no hay clave de Gemini en el servidor).</p>;
  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" disabled={busy} onClick={() => start(async () => { const r = await reviewAiSummary(id); if (r.ok) setText(r.text); else setError(r.error); })}>
        <Sparkles className="size-4" aria-hidden /> {busy ? "Escribiendo…" : "Resumen con IA"}
      </Button>
      <p className="text-xs text-muted">Opcional. Envía solo las cifras de esta revisión a Google (Gemini) y cuenta en tu presupuesto de IA.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export const More = ({ href, label = "Ver todo" }: { href: string; label?: string }) => (
  <Link href={href} className="inline-flex min-h-11 items-center gap-0.5 text-sm font-medium text-accent md:min-h-9">{label}<ChevronRight className="size-4" aria-hidden /></Link>
);

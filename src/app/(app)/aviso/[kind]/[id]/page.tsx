import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { NoticeActions } from "@/components/notifications/notice-actions";
import { PageHeader } from "@/components/layout/page-header";
import { getContext } from "@/lib/context";
import { formatDate, nowLocal } from "@/lib/dates";
import { getEvent, getTask } from "@/lib/tasks/data";
import { dueLabel } from "@/lib/tasks/format";

export const metadata = { title: "Aviso" };

/** Pantalla que se abre al tocar una notificación: el elemento con «Hecho» y «Posponer». */
export default async function AvisoPage({ params, searchParams }: { params: Promise<{ kind: string; id: string }>; searchParams: Promise<{ d?: string }> }) {
  const [{ kind, id }, sp] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success || !["task", "event", "reminder"].includes(kind)) notFound();
  const { supabase, workspaceId, timezone } = await getContext();
  const today = nowLocal(new Date(), timezone).date;

  if (kind === "task") {
    const t = await getTask(id);
    if (!t) notFound();
    const due = dueLabel(t.due_date, t.due_time, today);
    return (
      <>
        <PageHeader title={t.title} subtitle={[due.text, t.notes].filter(Boolean).join(" · ")} />
        <NoticeActions kind="task" id={id} done={t.status === "done"} />
        <Link href={`/tareas?v=todas&abrir=${id}`} className="mt-4 inline-block text-sm text-accent underline">Abrir la tarea completa</Link>
      </>
    );
  }
  if (kind === "event") {
    const e = await getEvent(id);
    if (!e) notFound();
    const day = sp.d ?? e.start_date;
    return (
      <>
        <PageHeader title={e.title} subtitle={`${formatDate(day)}${e.all_day ? " · todo el día" : ` · ${e.start_time?.slice(0, 5)}–${e.end_time?.slice(0, 5)}`}${e.location ? ` · ${e.location}` : ""}`} />
        {e.notes && <p className="mb-4 whitespace-pre-wrap text-sm">{e.notes}</p>}
        <Link href={`/calendario?v=semana&d=${day}`} className="text-sm text-accent underline">Ver en el calendario</Link>
      </>
    );
  }
  const { data: r } = await supabase.from("reminders").select("title, remind_at, status").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!r) notFound();
  const at = nowLocal(new Date(r.remind_at), timezone);
  return (
    <>
      <PageHeader title={r.title} subtitle={`Recordatorio · ${formatDate(at.date)} ${at.time}`} />
      <NoticeActions kind="reminder" id={id} done={false} />
    </>
  );
}

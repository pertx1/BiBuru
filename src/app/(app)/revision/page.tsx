import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ReviewView } from "@/components/review/review-view";
import { hasGeminiKey } from "@/lib/ai/gemini";
import { listBusinesses } from "@/lib/data";
import type { ReviewData } from "@/lib/review/build";
import { periodLabel, REVIEW_KINDS, REVIEW_LABEL, type ReviewKind } from "@/lib/review/period";
import { currentReview, getReview, listReviews } from "@/lib/review/service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Revisión" };

type SP = { tab?: string; negocio?: string; id?: string };
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Revisión diaria, semanal y mensual. La actual se calcula al momento (con todos los negocios o uno) y se puede tocar;
 * el histórico guarda la foto de cada una. «Revisado» la cierra; si no, sigue en Inicio.
 */
export default async function RevisionPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const kind: ReviewKind = REVIEW_KINDS.find((k) => k === sp.tab) ?? "diaria";
  const business = sp.negocio && UUID.test(sp.negocio) ? sp.negocio : null;
  const historicId = sp.id && UUID.test(sp.id) ? sp.id : null;
  const businesses = await listBusinesses();
  const bizName = business ? businesses.find((b) => b.id === business)?.name ?? null : null;

  let view: React.ReactNode;
  if (historicId) {
    const row = await getReview(historicId);
    if (!row || !(row.data as { v?: number }).v) notFound();
    view = <ReviewView data={row.data as unknown as ReviewData} id={row.id} reviewedAt={row.reviewed_at} aiSummary={row.ai_summary} aiConfigured={hasGeminiKey()} historic businessName={null} />;
  } else {
    const { row, data } = await currentReview(kind, business);
    view = <ReviewView data={data} id={row?.id ?? null} reviewedAt={row?.reviewed_at ?? null} aiSummary={row?.ai_summary ?? null} aiConfigured={hasGeminiKey()} historic={false} businessName={bizName} />;
  }

  const history = await listReviews(kind); // después: la actual se acaba de guardar
  const href = (o: SP) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ tab: kind === "diaria" ? undefined : kind, negocio: business ?? undefined, ...o })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/revision?${s}` : "/revision";
  };
  const chip = (on: boolean) => cn("flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-sm font-medium md:min-h-9", on ? "bg-accent text-accent-foreground" : "bg-fill");
  return (
    <>
      <PageHeader title="Revisión" subtitle="Cómo va todo, con datos reales. Se genera sola a la hora que elijas en Ajustes." />
      <div className="flex flex-col gap-3">
        <nav aria-label="Tipo de revisión" className="grid grid-cols-3 gap-1 rounded-full bg-fill p-1">
          {REVIEW_KINDS.map((k) => (
            <Link key={k} href={`/revision${k === "diaria" ? "" : `?tab=${k}`}${business ? `${k === "diaria" ? "?" : "&"}negocio=${business}` : ""}`} aria-current={k === kind ? "page" : undefined}
              className={cn("flex min-h-11 items-center justify-center rounded-full text-sm font-semibold md:min-h-9", k === kind ? "bg-surface shadow-sm" : "text-muted")}>{REVIEW_LABEL[k]}</Link>
          ))}
        </nav>
        {!historicId && businesses.length > 1 && (
          <nav aria-label="Negocio" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
            <Link href={href({ negocio: undefined })} className={chip(!business)}>Todos juntos</Link>
            {businesses.map((b) => <Link key={b.id} href={href({ negocio: b.id })} className={chip(business === b.id)}>{b.name}</Link>)}
          </nav>
        )}
        {historicId && <Link href={href({ id: undefined })} className="text-sm font-medium text-accent">← Volver a la revisión actual</Link>}
        {view}
        <section className="mt-2 rounded-xl bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold">Histórico</h2>
          {history.length === 0 ? <p className="text-sm text-muted">Aún no hay revisiones guardadas.</p> : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {history.map((r) => (
                <li key={r.id}><Link href={href({ id: r.id, negocio: undefined })} aria-current={r.id === historicId ? "page" : undefined} className="flex min-h-11 items-center justify-between gap-2">
                  <span className="first-letter:uppercase">{periodLabel({ kind, start: r.period_start, end: r.period_end })}</span>
                  <span className={r.reviewed_at ? "text-xs text-good" : "text-xs text-muted"}>{r.reviewed_at ? "Revisada" : "Sin cerrar"}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

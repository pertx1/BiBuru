import Link from "next/link";
import { ReviewedButton } from "@/components/review/review-client";
import { formatEUR } from "@/lib/money";
import type { ReviewData } from "@/lib/review/build";
import { REVIEW_LABEL } from "@/lib/review/period";
import { getContext } from "@/lib/context";
import { openReviews } from "@/lib/review/service";
import { WidgetCard } from "../widget-card";
import type { WidgetProps } from "../types";

/** «Revisión de hoy»: las revisiones sin cerrar (siguen aquí hasta pulsar «Revisado») con sus cifras clave. */
export async function ReviewTodayWidget({ w }: WidgetProps) {
  const open = await openReviews();
  if (!open.length) {
    return (
      <WidgetCard title="Revisión de hoy" href="/revision">
        <p className="text-sm text-muted">Todo revisado. 👌 La siguiente se genera sola a su hora.</p>
      </WidgetCard>
    );
  }
  const { supabase, workspaceId } = await getContext();
  const { data: rows } = await supabase.from("reviews").select("id, data").eq("workspace_id", workspaceId).in("id", open.map((r) => r.id));
  const byId = new Map((rows ?? []).map((r) => [r.id, r.data as unknown as ReviewData]));
  return (
    <WidgetCard title="Revisión de hoy" href="/revision">
      <ul className="flex flex-col gap-3">
        {open.slice(0, w.size === "s" ? 1 : 3).map((r) => {
          const d = byId.get(r.id);
          const bits = d?.v ? [
            `${d.money.curLabel}: ${formatEUR(d.money.cur.profit)}`,
            d.kind === "diaria" ? `${d.tasks.today.length + d.tasks.overdue.length} tareas` : `${d.tasks.done} hechas`,
            d.inbox.mail + d.inbox.social ? `${d.inbox.mail + d.inbox.social} sin responder` : "",
            d.stock.length ? `${d.stock.length} por pedir` : "",
          ].filter(Boolean) : [];
          return (
            <li key={r.id} className="flex flex-col gap-2 rounded-lg bg-fill p-3">
              <Link href={`/revision${r.kind === "diaria" ? "" : `?tab=${r.kind}`}`} className="text-sm">
                <span className="font-semibold">Revisión {REVIEW_LABEL[r.kind].toLowerCase()}</span>
                {bits.length > 0 && <span className="block text-xs text-muted">{bits.join(" · ")}</span>}
              </Link>
              {w.size !== "s" && <ReviewedButton id={r.id} reviewedAt={null} />}
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}

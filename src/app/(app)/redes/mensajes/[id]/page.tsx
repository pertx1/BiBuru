import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ThreadView } from "@/components/social/thread-view";
import { getContext } from "@/lib/context";
import { getThread, listSavedReplies } from "@/lib/inbox/data";
import { CAPABILITIES, replyWindow, type Platform } from "@/lib/inbox/logic";
import { markThreadRead } from "../../inbox-actions";

export const metadata = { title: "Conversación" };

/** Un hilo de la bandeja: conversación completa (en comentarios, la publicación arriba), respuesta y acciones. */
export default async function MensajePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ volver?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await getThread(id);
  if (!data) notFound();
  const { thread, messages } = data;
  const { supabase, workspaceId, userId } = await getContext();
  const [{ data: acc }, { data: profile }] = await Promise.all([
    supabase.from("social_accounts").select("username, business_id, platform").eq("id", thread.account_id).eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("profiles").select("inbox_ai_suggest").eq("user_id", userId).maybeSingle(),
  ]);
  const [replies, orders] = await Promise.all([
    listSavedReplies(acc?.business_id ?? null),
    acc?.business_id ? supabase.from("orders").select("id, customer, order_number, order_date").eq("workspace_id", workspaceId).eq("business_id", acc.business_id).order("order_date", { ascending: false }).limit(30).then((r) => r.data ?? []) : Promise.resolve([]),
  ]);
  if (thread.unread) await markThreadRead(id);
  const back = sp.volver && /^\/(?!\/)[\w\-/?=&%.]*$/.test(sp.volver) ? sp.volver : "/redes?vista=bandeja";
  const cap = CAPABILITIES[thread.platform as Platform];
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link href={back} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-foreground md:min-h-10"><ChevronLeft className="size-4" aria-hidden /> Bandeja</Link>
      <ThreadView thread={thread} messages={messages} accountUsername={acc?.username ?? null} businessId={acc?.business_id ?? null}
        window={thread.kind === "dm" ? replyWindow(thread.last_inbound_at) : null} capabilities={cap} savedReplies={replies} aiEnabled={!!profile?.inbox_ai_suggest}
        orders={orders.map((o) => ({ id: o.id, label: `${o.customer ?? (o.order_number ? `Pedido ${o.order_number}` : "Sin cliente")} · ${o.order_date.split("-").reverse().join("/")}` }))} />
    </div>
  );
}

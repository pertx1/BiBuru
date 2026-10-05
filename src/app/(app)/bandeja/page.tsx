import { InboxList } from "@/components/capture/inbox-list";
import { PageHeader } from "@/components/layout/page-header";
import { BudgetBanner } from "@/components/ai/budget-banner";
import { hasGeminiKey } from "@/lib/ai/gemini";
import { listBusinesses, listCategories } from "@/lib/data";
import { listInbox } from "@/lib/notes/data";
import { getContext } from "@/lib/context";
import { getNow } from "@/lib/tasks/data";

import { AutoApplied } from "@/components/capture/auto-applied";

export const metadata = { title: "Bandeja de entrada" };

export default async function BandejaPage() {
  const { supabase, workspaceId } = await getContext();
  const [items, now, businesses, categories, auto] = await Promise.all([
    listInbox("open"), getNow(), listBusinesses(), listCategories(),
    supabase.from("inbox_items").select("id, raw_text, proposal, processed_at").eq("workspace_id", workspaceId).eq("status", "accepted").not("proposal", "is", null).order("processed_at", { ascending: false }).limit(8),
  ]);
  const autoApplied = (auto.data ?? []).filter((r) => (r.proposal as { auto?: boolean } | null)?.auto === true);
  return (
    <>
      <PageHeader title="Bandeja de entrada" subtitle="Lo que has apuntado y aún no has clasificado. Un toque y listo." />
      <BudgetBanner />
      <InboxList items={items} today={now.date} nowTime={now.time} businesses={businesses.map((b) => ({ id: b.id, name: b.name }))} categories={categories.map((c) => c.name)} aiEnabled={hasGeminiKey()} />
      <AutoApplied rows={autoApplied.map((r) => ({ id: r.id, text: r.raw_text, result: (r.proposal as unknown as { result?: { kind: string; id: string; label: string; href: string } }).result }))} />
    </>
  );
}

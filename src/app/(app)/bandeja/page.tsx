import { InboxList } from "@/components/capture/inbox-list";
import { PageHeader } from "@/components/layout/page-header";
import { listInbox } from "@/lib/notes/data";
import { getNow } from "@/lib/tasks/data";

export const metadata = { title: "Bandeja de entrada" };

export default async function BandejaPage() {
  const [items, now] = await Promise.all([listInbox("open"), getNow()]);
  return (
    <>
      <PageHeader title="Bandeja de entrada" subtitle="Lo que has apuntado y aún no has clasificado. Un toque y listo." />
      <InboxList items={items} today={now.date} nowTime={now.time} />
    </>
  );
}

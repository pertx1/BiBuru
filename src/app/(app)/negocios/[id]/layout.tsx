import Link from "next/link";
import { notFound } from "next/navigation";
import { BusinessFormButton } from "@/components/businesses/business-form";
import { BusinessIcon } from "@/components/businesses/business-icon";
import { BusinessTabs } from "@/components/businesses/business-tabs";
import { getBusiness } from "@/lib/data";
import { countBusinessUnanswered } from "@/lib/messages/data";
import { z } from "zod";

export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [business, unanswered] = await Promise.all([getBusiness(id), countBusinessUnanswered(id)]);
  if (!business) notFound();
  return (
    <>
      <Link href="/negocios" className="mb-1 inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">← Negocios</Link>
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <BusinessIcon name={business.icon} color={business.color} className="size-11" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{business.name}{business.archived && <span className="ml-2 text-sm font-normal text-muted">archivado</span>}</h1>
          {business.description && <p className="truncate text-sm text-muted">{business.description}</p>}
        </div>
        <BusinessFormButton business={business} />
      </header>
      <BusinessTabs id={id} production={business.production_enabled} unanswered={unanswered} />
      <div className="mt-5">{children}</div>
    </>
  );
}

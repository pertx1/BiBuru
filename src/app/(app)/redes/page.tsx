import { PageHeader } from "@/components/layout/page-header";
import { SocialAccounts } from "@/components/social/social-accounts";
import { SocialStats } from "@/components/social/social-stats";
import { PostsView } from "@/components/social/posts-view";
import { listBusinesses } from "@/lib/data";
import { addDays, todayISO } from "@/lib/dates";
import { accountStats, listPosts, listSocialAccounts, socialConfigured, storageUsed } from "@/lib/social/data";
import { STORAGE_LIMIT_BYTES } from "@/lib/social/service";
import { cn } from "@/lib/utils";
import Link from "next/link";

export const metadata = { title: "Redes" };
type SP = { vista?: string; cuenta?: string; dias?: string; abrir?: string; instagram?: string; tiktok?: string };

export default async function RedesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const view = sp.vista === "publicaciones" ? "publicaciones" : "estadisticas";
  const [accounts, businesses] = await Promise.all([listSocialAccounts().catch(() => []), listBusinesses()]);
  const cfg = socialConfigured();
  const days = [7, 30, 90].includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const today = todayISO();
  const to = addDays(today, -1), from = addDays(to, -(days - 1)), prevFrom = addDays(from, -days);
  const current = accounts.find((a) => a.id === sp.cuenta) ?? accounts[0];
  const tab = (v: string, l: string) => (
    <Link href={`/redes?vista=${v}${current ? `&cuenta=${current.id}` : ""}`} aria-current={view === v ? "page" : undefined}
      className={cn("flex min-h-11 items-center border-b-2 border-transparent px-3 text-sm font-medium text-muted md:min-h-9", view === v && "border-accent text-foreground")}>{l}</Link>
  );
  return (
    <>
      <PageHeader title="Redes" subtitle="Instagram y TikTok de tus negocios: estadísticas y publicaciones programadas." />
      <SocialAccounts accounts={accounts} businesses={businesses.map((b) => ({ id: b.id, name: b.name }))} configured={cfg} audited={process.env.TIKTOK_DIRECT_POST_AUDITED === "1"} nowMs={new Date(`${today}T12:00:00Z`).getTime()} result={{ instagram: sp.instagram, tiktok: sp.tiktok }} />
      <nav className="mb-4 mt-5 flex gap-1 border-b border-border" aria-label="Secciones de Redes">{tab("estadisticas", "Estadísticas")}{tab("publicaciones", "Publicaciones")}</nav>
      {view === "estadisticas" ? (
        current ? <SocialStats account={current} accounts={accounts} days={days} {...await accountStats(current.id, from, to, prevFrom)} to={to} prevFrom={prevFrom} />
          : <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">Conecta una cuenta para ver sus estadísticas. Se guarda una foto de los datos cada día para tener tu propio histórico.</p>
      ) : (
        <PostsView posts={await listPosts()} accounts={accounts.map((a) => ({ id: a.id, platform: a.platform, username: a.username, status: a.status, scopes: a.scopes }))}
          businesses={businesses.map((b) => ({ id: b.id, name: b.name }))} today={today} openId={sp.abrir ?? null} used={await storageUsed()} limit={STORAGE_LIMIT_BYTES} />
      )}
    </>
  );
}

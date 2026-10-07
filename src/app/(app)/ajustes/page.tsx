import { PageHeader } from "@/components/layout/page-header";
import { InstallGuide } from "@/components/pwa/install-guide";
import { NotificationSettingsForm } from "@/components/notifications/notification-settings";
import { PushSetup } from "@/components/notifications/push-setup";
import { AiSettingsForm } from "@/components/ai/ai-settings";
import { BudgetBanner } from "@/components/ai/budget-banner";
import { getBudget } from "@/lib/ai/run";
import { getModelNames, hasGeminiKey } from "@/lib/ai/gemini";
import { DEFAULT_PRICES } from "@/lib/ai/pricing";
import { getContext } from "@/lib/context";
import { YoutubeSettings } from "@/components/favorites/youtube-settings";
import { PlaylistFeeds } from "@/components/favorites/playlist-feeds";
import { NavSettings } from "@/components/account/nav-settings";
import { NewsSettings, type SourceView } from "@/components/news/news-settings";
import { ensureNewsSetup } from "@/lib/news/service";
import { getUiPrefs } from "@/lib/home/prefs";
import { googleConfig } from "@/lib/favorites/youtube";
import { KeyGenerator } from "@/components/account/key-generator";
import { ProfityImport } from "@/components/account/profity-import";
import { DataSettings } from "@/components/account/data-settings";
import { ThemeToggle } from "@/components/theme-toggle";
import { MailSettings } from "@/components/mail/mail-settings";
import { listMailAccounts, mailConfigured } from "@/lib/mail/data";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

export const metadata = { title: "Ajustes" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function AjustesPage({ searchParams }: { searchParams: Promise<{ google?: string; outlook?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .maybeSingle();

  const { data: devices } = await supabase.from("push_subscriptions").select("id, endpoint, user_agent, created_at, last_success_at").order("created_at");
  const p = profile;
  const { data: integ } = await supabase.from("integrations").select("account_email, last_sync_at, last_sync_error, last_sync_added, sync_likes, sync_playlists").eq("provider", "google").maybeSingle();
  const ctx = await getContext();
  await ensureNewsSetup(supabase, ctx.workspaceId, ctx.userId);
  const [{ data: newsTopics }, { data: newsSources }] = await Promise.all([
    supabase.from("news_topics").select("id, name, description, keywords, color, active").eq("workspace_id", ctx.workspaceId).order("sort_order"),
    supabase.from("news_sources").select("id, kind, name, handle, topic_id, active, status, last_error, last_checked_at, preset").eq("workspace_id", ctx.workspaceId).order("created_at"),
  ]);
  const { data: feeds } = await supabase.from("youtube_feeds").select("id, title, last_checked_at, last_error, last_added").eq("workspace_id", ctx.workspaceId).order("created_at");
  const budgetCents = p?.ai_monthly_budget_cents ?? 1000;
  const budget = await getBudget({ supabase: ctx.supabase, workspaceId: ctx.workspaceId, timezone: ctx.timezone, budgetCents });
  const [mailAccounts, { data: mailBiz }] = await Promise.all([listMailAccounts().catch(() => []), supabase.from("businesses").select("id, name").eq("workspace_id", ctx.workspaceId).eq("archived", false).order("name")]);
  const mailBusinesses = mailBiz ?? [];
  const mailAi = (p as { mail_ai_allowed?: boolean } | null)?.mail_ai_allowed;
  const models = getModelNames();
  const { data: saved } = await supabase.from("ai_prices").select("model, input_eur_per_mtok, output_eur_per_mtok");
  const price = (model: string, d: { input: number; output: number }) => { const r = saved?.find((x) => x.model === model); return { model, input: r ? Number(r.input_eur_per_mtok) : d.input, output: r ? Number(r.output_eur_per_mtok) : d.output }; };
  const prices = [price(models.fast, DEFAULT_PRICES.fast), ...(models.video !== models.fast ? [price(models.video, DEFAULT_PRICES.video)] : [])];
  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="flex max-w-xl flex-col gap-4">
        <Section title="Cuenta">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Correo</dt>
            <dd>{auth.user?.email}</dd>
            <dt className="text-muted">Zona horaria</dt>
            <dd>{profile?.timezone ?? "Europe/Madrid"}</dd>
            <dt className="text-muted">Presupuesto IA</dt>
            <dd>{((profile?.ai_monthly_budget_cents ?? 1000) / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })} / mes</dd>
          </dl>
        </Section>
        <Section title="Avisos en este dispositivo"><PushSetup vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} devices={devices ?? []} /></Section>
        {p && (
          <Section title="Qué avisos quieres">
            <NotificationSettingsForm initial={{
              task_reminders_enabled: p.task_reminders_enabled, event_lead_minutes: p.event_lead_minutes, quiet_hours_start: p.quiet_hours_start, quiet_hours_end: p.quiet_hours_end,
              daily_digest_enabled: p.daily_digest_enabled, daily_digest_time: p.daily_digest_time, overdue_alert_enabled: p.overdue_alert_enabled, overdue_alert_time: p.overdue_alert_time,
              weekly_review_enabled: p.weekly_review_enabled, weekly_review_dow: p.weekly_review_dow, weekly_review_time: p.weekly_review_time,
            }} />
          </Section>
        )}
        <Section title="Inteligencia artificial">
          <BudgetBanner />
          <AiSettingsForm hasKey={hasGeminiKey()} budgetEur={budgetCents / 100} autoApply={p?.ai_auto_apply ?? false} spentMicros={budget.spentMicros} pct={budget.pct} byFeature={budget.byFeature} prices={prices} />
        </Section>
        <Section title="Listas de YouTube (sin Google Cloud)">
          <PlaylistFeeds feeds={(feeds ?? []).map((f) => ({ id: f.id, title: f.title, lastCheckedAt: f.last_checked_at, lastError: f.last_error, lastAdded: f.last_added }))} />
        </Section>
        <Section title="YouTube y vídeos">
          <YoutubeSettings configured={!!googleConfig() && !!process.env.TOKEN_ENCRYPTION_KEY} longMinutes={p?.video_long_minutes ?? 20} flash={sp.google}
            status={integ ? { email: integ.account_email, lastSyncAt: integ.last_sync_at, lastError: integ.last_sync_error, lastAdded: integ.last_sync_added, likes: integ.sync_likes, playlists: Array.isArray(integ.sync_playlists) ? (integ.sync_playlists as { id: string; title: string }[]) : [] } : null} />
        </Section>
        <div id="correo" className="scroll-mt-20"><Section title="Correo de Outlook">
          <MailSettings configured={mailConfigured()} accounts={mailAccounts} businesses={mailBusinesses} aiAllowed={!!mailAi} result={sp.outlook} />
        </Section></div>
        <Section title="Apariencia"><ThemeToggle /></Section>
        <Section title="Noticias">
          <NewsSettings settings={{ enabled: p?.news_enabled ?? true, time: (p?.news_time ?? "08:00").slice(0, 5), weekends: p?.news_weekends ?? true }} topics={newsTopics ?? []} sources={(newsSources ?? []) as SourceView[]} />
        </Section>
        <Section title="Navegación"><NavSettings {...await getUiPrefs().then((u) => ({ tabs: u.tabs, showCapture: u.showCapture }))} /></Section>
        <Section title="Instalar la app"><InstallGuide /></Section>
        <Section title="Asistente de configuración"><KeyGenerator /></Section>
        <Section title="Importar desde PROFITY"><ProfityImport /></Section>
        <Section title="Tus datos"><DataSettings email={auth.user?.email ?? ""} /></Section>
        <form action={signOut}>
          <Button type="submit" variant="secondary">Cerrar sesión</Button>
        </form>
      </div>
    </>
  );
}

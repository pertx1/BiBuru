import { PageHeader } from "@/components/layout/page-header";
import { InstallGuide } from "@/components/pwa/install-guide";
import { NotificationSettingsForm } from "@/components/notifications/notification-settings";
import { PushSetup } from "@/components/notifications/push-setup";
import { ThemeToggle } from "@/components/theme-toggle";
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

export default async function AjustesPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .maybeSingle();

  const { data: devices } = await supabase.from("push_subscriptions").select("id, endpoint, user_agent, created_at, last_success_at").order("created_at");
  const p = profile;
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
              task_lead_minutes: p.task_lead_minutes, event_lead_minutes: p.event_lead_minutes, quiet_hours_start: p.quiet_hours_start, quiet_hours_end: p.quiet_hours_end,
              daily_digest_enabled: p.daily_digest_enabled, daily_digest_time: p.daily_digest_time, overdue_alert_enabled: p.overdue_alert_enabled, overdue_alert_time: p.overdue_alert_time,
              weekly_review_enabled: p.weekly_review_enabled, weekly_review_dow: p.weekly_review_dow, weekly_review_time: p.weekly_review_time,
            }} />
          </Section>
        )}
        <Section title="Apariencia"><ThemeToggle /></Section>
        <Section title="Instalar la app"><InstallGuide /></Section>
        <form action={signOut}>
          <Button type="submit" variant="secondary">Cerrar sesión</Button>
        </form>
      </div>
    </>
  );
}

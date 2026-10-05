import { PageHeader } from "@/components/layout/page-header";
import { InstallGuide } from "@/components/pwa/install-guide";
import { ReviewSettings } from "@/components/goals/review-settings";
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
    .select("timezone, ai_monthly_budget_cents, weekly_review_dow, weekly_review_time")
    .maybeSingle();

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
        <Section title="Revisión semanal de objetivos"><p className="mb-3 text-xs text-muted">El día y la hora en que te avisaremos para actualizar el avance de tus objetivos.</p><ReviewSettings dow={profile?.weekly_review_dow ?? 0} time={profile?.weekly_review_time ?? "10:00"} /></Section>
        <Section title="Apariencia"><ThemeToggle /></Section>
        <Section title="Instalar la app"><InstallGuide /></Section>
        <form action={signOut}>
          <Button type="submit" variant="secondary">Cerrar sesión</Button>
        </form>
      </div>
    </>
  );
}

import { LoginForm } from "./login-form";
import { signOut } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6 pt-safe pb-safe">
      <div className="flex flex-col gap-1">
        <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-accent text-xl font-bold text-accent-foreground">
          B
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">BiBuru</h1>
        <p className="text-sm text-muted">Tu segundo cerebro para negocios y día a día.</p>
      </div>
      {error === "perfil" ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm">
          <p className="font-medium">Tu cuenta existe, pero falta su perfil en la base de datos.</p>
          <p className="text-muted">Suele pasar si la cuenta se creó antes de aplicar las migraciones de Supabase. Ejecuta en Supabase → SQL Editor todas las migraciones de <code>supabase/migrations</code> que falten (en orden; la última repara las cuentas) y vuelve a entrar.</p>
          <form action={signOut}><button type="submit" className="min-h-11 rounded-lg border border-border bg-surface px-4 font-medium">Cerrar sesión y volver</button></form>
        </div>
      ) : (
        <LoginForm linkError={error === "enlace"} />
      )}
    </main>
  );
}

import { LoginForm } from "./login-form";
import { signOut } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; motivo?: string }>;
}) {
  const { error, motivo } = await searchParams;
  // Referencia del proyecto de Supabase (es pública: va en la URL que usa el navegador). Sirve para comprobar que es el mismo.
  const projectRef = (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0]; } catch { return "?"; } })();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6 pt-safe pb-safe">
      <div className="flex flex-col gap-1">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático */}
        <img src="/brand/mascot.svg" alt="" width={96} height={96} className="mb-2 size-24" />
        <h1 className="text-[2.1rem] font-extrabold leading-tight tracking-tight">BiBuru</h1>
        <p className="text-sm text-muted">Tu segundo cerebro para negocios y día a día.</p>
      </div>
      {error === "perfil" ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm">
          <p className="font-medium">Tu cuenta existe, pero falta su perfil en la base de datos.</p>
          <p className="text-muted">Suele pasar si la cuenta se creó antes de aplicar las migraciones de Supabase. Ejecuta en Supabase → SQL Editor todas las migraciones de <code>supabase/migrations</code> que falten (en orden; la última repara las cuentas) y vuelve a entrar.</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-surface p-3 text-xs">
            <dt className="text-muted">Proyecto de Supabase</dt><dd className="break-all font-mono">{projectRef}</dd>
            <dt className="text-muted">Motivo</dt><dd className="break-all font-mono">{(motivo ?? "desconocido").slice(0, 160)}</dd>
          </dl>
          <p className="text-xs text-muted">Comprueba que en Supabase estás en el proyecto cuya dirección empieza por ese código (Project Settings → General → Project ID).</p>
          <form action={signOut}><button type="submit" className="min-h-11 rounded-lg border border-border bg-surface px-4 font-medium">Cerrar sesión y volver</button></form>
        </div>
      ) : (
        <LoginForm linkError={error === "enlace"} />
      )}
    </main>
  );
}

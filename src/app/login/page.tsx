import { LoginForm } from "./login-form";

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
      <LoginForm linkError={error === "enlace"} />
    </main>
  );
}

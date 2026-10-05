export const metadata = { title: "Sin conexión" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-xl font-semibold">Sin conexión</h1>
      <p className="text-sm text-muted">No hay red ahora mismo. Vuelve a intentarlo cuando recuperes la conexión.</p>
    </main>
  );
}

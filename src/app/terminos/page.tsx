import Link from "next/link";

export const metadata = { title: "Condiciones de uso" };

/** Página pública (la piden Meta y TikTok al registrar la app). */
export default function TerminosPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed">
      <h1 className="mb-1 text-2xl font-semibold">Condiciones de uso de BiBuru</h1>
      <p className="mb-6 text-muted">Última actualización: 7 de octubre de 2026</p>
      <section className="flex flex-col gap-4">
        <p>BiBuru es una herramienta personal y privada para organizar negocios y tareas. Al usarla aceptas estas condiciones.</p>
        <ul className="list-disc pl-5">
          <li>Solo pueden usarla las personas con cuenta. Cada persona es responsable de lo que apunta y de lo que publica desde ella.</li>
          <li>Las publicaciones en Instagram y TikTok se hacen en tus propias cuentas y siguiendo las normas de esas plataformas.</li>
          <li>BiBuru solo lee tu correo de Outlook: no envía, borra ni cambia correos.</li>
          <li>El servicio se ofrece tal cual, sin garantías. Puede cambiar o dejar de estar disponible.</li>
          <li>Puedes dejar de usarlo y borrar tu cuenta cuando quieras.</li>
        </ul>
        <p><Link href="/privacidad" className="text-accent underline">Política de privacidad</Link></p>
      </section>
    </main>
  );
}

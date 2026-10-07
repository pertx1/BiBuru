import Link from "next/link";

export const metadata = { title: "Política de privacidad" };

/** Página pública (la piden Meta y TikTok al registrar la app). El correo de contacto sale de PRIVACY_CONTACT_EMAIL. */
export default function PrivacidadPage() {
  const contact = process.env.PRIVACY_CONTACT_EMAIL?.trim();
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed">
      <h1 className="mb-1 text-2xl font-semibold">Política de privacidad de BiBuru</h1>
      <p className="mb-6 text-muted">Última actualización: 7 de octubre de 2026</p>
      <section className="flex flex-col gap-4">
        <p>BiBuru es un panel personal para llevar tus negocios y tu día a día. Solo lo usan las personas con cuenta. No se venden datos ni se usan para publicidad.</p>
        <h2 className="text-lg font-semibold">Qué datos se guardan</h2>
        <ul className="list-disc pl-5">
          <li>Lo que tú apuntas: tareas, notas, pedidos, cobros, gastos, stock, objetivos y vídeos guardados.</li>
          <li>Si conectas Outlook: remitente, asunto, fecha y un extracto de los correos de tu bandeja de entrada. El contenido completo y los adjuntos se piden a Microsoft solo cuando abres un correo y no se guardan.</li>
          <li>Si conectas Instagram o TikTok: nombre de usuario, foto de perfil, estadísticas (seguidores, alcance, visualizaciones, interacciones) y datos públicos de tus publicaciones. Los archivos que subes para programar se borran pocos días después de publicarse.</li>
          <li>Los permisos de acceso (tokens) a Google, Microsoft, Instagram y TikTok se guardan cifrados y solo los usa el servidor.</li>
        </ul>
        <h2 className="text-lg font-semibold">Con quién se comparten</h2>
        <ul className="list-disc pl-5">
          <li>Supabase (base de datos y archivos) y Vercel (alojamiento), que guardan los datos por encargo de BiBuru.</li>
          <li>Google Gemini, solo para las funciones de IA que usas (por ejemplo, resumir un vídeo). Los correos solo se envían a la IA si activas esa opción y pulsas «Resumir con IA».</li>
          <li>Microsoft, Meta (Instagram) y TikTok, solo para leer o publicar lo que tú pides en tus propias cuentas.</li>
        </ul>
        <h2 className="text-lg font-semibold">Tus derechos</h2>
        <p>Puedes desconectar cualquier cuenta en Ajustes o en Redes (se borran su token y sus datos guardados), exportar tus datos y borrar tu cuenta entera desde Ajustes. También puedes retirar el permiso desde Microsoft, Instagram o TikTok.</p>
        <p>{contact ? <>Para cualquier duda o para ejercer tus derechos, escribe a <a className="text-accent underline" href={`mailto:${contact}`}>{contact}</a>.</> : "Para cualquier duda o para ejercer tus derechos, contacta con la persona responsable de BiBuru."}</p>
        <p><Link href="/terminos" className="text-accent underline">Condiciones de uso</Link></p>
      </section>
    </main>
  );
}

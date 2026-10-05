import { z } from "zod";

/**
 * Variables públicas: se incrustan en el cliente. Next.js solo sustituye
 * accesos literales `process.env.NEXT_PUBLIC_*`, por eso se leen una a una.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

export function getPublicEnv() {
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

/** Solo servidor. Nunca importar desde un componente de cliente. */
export function getServerEnv() {
  return z
    .object({ ALLOWED_EMAILS: z.string().min(3) })
    .parse({ ALLOWED_EMAILS: process.env.ALLOWED_EMAILS });
}

/** Solo servidor: claves para los avisos y el cron. Falla con un mensaje claro si falta algo. */
export function getNotificationEnv() {
  return z
    .object({
      SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
      CRON_SECRET: z.string().min(20),
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(40),
      VAPID_PRIVATE_KEY: z.string().min(20),
      VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/)/, "Debe empezar por mailto: o https://"),
    })
    .parse({
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      CRON_SECRET: process.env.CRON_SECRET,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    });
}

/** Solo las claves VAPID (para enviar avisos desde una acción del usuario, p. ej. «enviar aviso de prueba»). */
export function getVapidEnv() {
  return z
    .object({
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(40),
      VAPID_PRIVATE_KEY: z.string().min(20),
      VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/)/, "Debe empezar por mailto: o https://"),
    })
    .parse({
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    });
}

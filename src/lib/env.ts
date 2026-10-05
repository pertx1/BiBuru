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

import { z } from "zod";

export const emailSchema = z.email("Escribe un correo válido.");
/** Contraseña: mínimo 8 (Supabase lo exige ≥ 6) y máximo 72 (límite de bcrypt). */
export const passwordSchema = z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(72, "La contraseña es demasiado larga (máximo 72).");

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isEmailAllowed, normalizeEmail } from "@/lib/allowed-emails";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { step: "email" | "code"; email?: string; error?: string };

const emailSchema = z.email("Escribe un correo válido.");
const codeSchema = z.string().regex(/^\d{6,10}$/, "El código son solo números.");

/** Paso 1: envía el correo con enlace mágico y código. */
export async function requestLogin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { step: "email", error: parsed.error.issues[0].message };
  const email = normalizeEmail(parsed.data);

  // Respuesta idéntica exista o no el correo: no revelamos quién tiene acceso.
  if (!isEmailAllowed(email, process.env.ALLOWED_EMAILS)) return { step: "code", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) {
    console.error("signInWithOtp", error.status, error.code);
    const msg =
      error.status === 429
        ? "Demasiados intentos. Espera unos minutos y vuelve a probar."
        : "No se pudo enviar el correo. Inténtalo de nuevo en un momento.";
    return { step: "email", error: msg };
  }
  return { step: "code", email };
}

/** Paso 2: entra con el código de 6 dígitos del correo (necesario en la PWA de iPhone). */
export async function verifyCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const parsed = codeSchema.safeParse(String(formData.get("code") ?? "").replace(/\s/g, ""));
  if (!parsed.success) return { step: "code", email, error: parsed.error.issues[0].message };
  if (!isEmailAllowed(email, process.env.ALLOWED_EMAILS)) {
    return { step: "code", email, error: "Código incorrecto o caducado." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: parsed.data, type: "email" });
  if (error) return { step: "code", email, error: "Código incorrecto o caducado." };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

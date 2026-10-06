"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { hasAccess, normalizeEmail } from "@/lib/allowed-emails";
import { emailSchema, passwordSchema } from "@/lib/auth-schemas";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { step: "email" | "code"; email?: string; error?: string };

const codeSchema = z.string().regex(/^\d{6,10}$/, "El código son solo números.");

/** Paso 1: envía el correo con enlace mágico y código. */
export async function requestLogin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { step: "email", error: parsed.error.issues[0].message };
  const email = normalizeEmail(parsed.data);

  // Respuesta idéntica exista o no el correo: no revelamos quién tiene acceso.
  if (!hasAccess(email)) return { step: "code", email };

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
  if (!hasAccess(email)) {
    return { step: "code", email, error: "Código incorrecto o caducado." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: parsed.data, type: "email" });
  if (error) return { step: "code", email, error: "Código incorrecto o caducado." };
  redirect("/");
}

export type PasswordState = { error?: string };

/** Crea la cuenta con correo y contraseña, sin código del correo. Requiere «Confirm email» desactivado en Supabase. */
export async function signUpWithPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const e = emailSchema.safeParse(formData.get("email"));
  if (!e.success) return { error: e.error.issues[0].message };
  const pw = passwordSchema.safeParse(formData.get("password"));
  if (!pw.success) return { error: pw.error.issues[0].message };
  if (pw.data !== String(formData.get("password2") ?? "")) return { error: "Las dos contraseñas no coinciden." };
  const email = normalizeEmail(e.data);
  if (!hasAccess(email)) return { error: "No se pudo crear la cuenta con ese correo." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password: pw.data });
  if (error) {
    console.error("signUp", error.status, error.code);
    return { error: error.status === 429 ? "Demasiados intentos. Espera unos minutos." : error.code === "weak_password" ? "Esa contraseña es demasiado débil. Prueba con otra más larga." : "No se pudo crear la cuenta. Si ya la tienes, entra con tu contraseña." };
  }
  // Con «Confirm email» activado, Supabase no devuelve sesión y exige el código: lo decimos claro.
  if (!data.session) return { error: "Supabase todavía pide confirmar el correo. Desactiva «Confirm email» en Authentication → Sign In / Providers → Email." };
  redirect("/");
}

/** Entra con correo y contraseña. Mensaje idéntico exista o no la cuenta. */
export async function signInWithPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const e = emailSchema.safeParse(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const bad = { error: "Correo o contraseña incorrectos." };
  if (!e.success || !password || password.length > 72) return bad;
  const email = normalizeEmail(e.data);
  if (!hasAccess(email)) return bad;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return error.status === 429 ? { error: "Demasiados intentos. Espera unos minutos." } : bad;
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

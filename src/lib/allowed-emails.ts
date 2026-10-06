/** Normaliza un correo para compararlo (minúsculas, sin espacios). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Convierte `ALLOWED_EMAILS` ("a@x.com, b@y.com") en una lista normalizada. */
export function parseAllowedEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map(normalizeEmail)
    .filter(Boolean);
}

/**
 * Registro cerrado: solo entran los correos de la lista. Si la lista está vacía
 * no entra nadie (fallo seguro, nunca "abierto por error").
 */
export function isEmailAllowed(email: string, raw: string | undefined): boolean {
  const list = parseAllowedEmails(raw);
  return list.length > 0 && list.includes(normalizeEmail(email));
}

/**
 * ¿Puede este correo usar la app? Registro ABIERTO por defecto: cualquiera que cree una cuenta. Con `OPEN_SIGNUP=false`
 * vuelve el modo cerrado: solo los correos de `ALLOWED_EMAILS`. Un único punto de decisión para el acceso, el registro,
 * el enlace del correo y el proxy.
 */
export function hasAccess(email: string, env: { allowed?: string; open?: string } = { allowed: process.env.ALLOWED_EMAILS, open: process.env.OPEN_SIGNUP }): boolean {
  return env.open !== "false" || isEmailAllowed(email, env.allowed);
}

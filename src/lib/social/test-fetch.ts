/**
 * Solo pruebas locales (scripts/e2e/social-publish.mjs): con SOCIAL_API_TEST_BASE, las llamadas a Instagram y TikTok van a
 * un servidor falso (`https://host/ruta` → `<base>/host/ruta`). Nunca se activa en Vercel.
 */
export const socialFetch: typeof fetch = (input, init) => {
  const base = process.env.SOCIAL_API_TEST_BASE;
  if (!base || process.env.VERCEL) return fetch(input, init);
  const u = new URL(String(input instanceof Request ? input.url : input));
  return fetch(`${base}/${u.hostname}${u.pathname}${u.search}`, init);
};

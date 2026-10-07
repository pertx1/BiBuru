/**
 * HTML de correos: se limpia en el servidor (sin scripts, formularios, iframes ni manejadores `on…`) y ADEMÁS se muestra
 * dentro de un iframe aislado (`sandbox` sin scripts) con una política de contenido que bloquea imágenes remotas
 * (píxeles de seguimiento) hasta que la persona pulse «Mostrar imágenes».
 */
const DROP_BLOCKS = /<(script|style|iframe|object|embed|noscript|template|svg|math|textarea|select|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const DROP_SINGLE = /<\/?(script|style|iframe|object|embed|form|input|button|textarea|select|option|base|meta|link|frame|frameset|svg|math|noscript|template)\b[^>]*>/gi;

export function sanitizeMailHtml(html: string): string {
  let s = html.slice(0, 500_000);
  // Se conservan los estilos en línea pero no las hojas <style> (pueden cargar recursos externos).
  s = s.replace(/<!--[\s\S]*?-->/g, "").replace(DROP_BLOCKS, "").replace(DROP_SINGLE, "");
  s = s.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/\s+(href|src|action|formaction|background|poster|xlink:href)\s*=\s*("|')\s*(javascript|vbscript|data:text\/html)[^"']*\2/gi, "");
  s = s.replace(/\s+(href|src)\s*=\s*(javascript|vbscript):[^\s>]+/gi, "");
  s = s.replace(/expression\s*\(/gi, "(").replace(/url\s*\(\s*['"]?\s*javascript:/gi, "url(");
  // Los enlaces se abren fuera, sin revelar desde dónde.
  s = s.replace(/<a\b/gi, '<a target="_blank" rel="noopener noreferrer"');
  return s;
}

/** Documento completo para el iframe. `images`: si se permiten imágenes remotas (https). */
export function mailFrameDoc(cleanHtml: string, o: { images: boolean; dark: boolean }): string {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data: cid:${o.images ? " https:" : ""}; font-src data:`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>
html,body{margin:0;padding:12px;font:15px/1.5 -apple-system,system-ui,sans-serif;word-wrap:break-word;${o.dark ? "background:#fff;color:#111;" : ""}}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}</style></head><body>${cleanHtml}</body></html>`;
}

/** Texto plano de un correo (para «Guardar como nota»). */
export function mailHtmlToText(html: string): string {
  return sanitizeMailHtml(html)
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n").replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Texto plano → HTML seguro (correos que llegan como texto). */
export const textToHtml = (t: string) => `<pre>${t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`;

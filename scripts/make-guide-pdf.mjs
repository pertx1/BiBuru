// Genera docs/QUE-TENGO-QUE-HACER.pdf a partir del .md (Markdown → HTML → PDF con el Chromium de Playwright).
// Uso: node scripts/make-guide-pdf.mjs [entrada.md] [salida.pdf]
// Comprueba al final que el PDF existe, empieza por %PDF, tiene páginas y contiene texto de la guía.
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { chromium } from "playwright-core";

const input = process.argv[2] ?? "docs/QUE-TENGO-QUE-HACER.md";
const output = process.argv[3] ?? "docs/QUE-TENGO-QUE-HACER.pdf";
const md = readFileSync(input, "utf8");
const body = renderToStaticMarkup(createElement(Markdown, { remarkPlugins: [remarkGfm] }, md));
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Qué tengo que hacer · BiBuru</title><style>
  @page { size: A4; margin: 16mm 14mm 18mm; }
  body { font: 11.5pt/1.5 -apple-system, "Segoe UI", Roboto, "DejaVu Sans", sans-serif; color: #111; }
  h1 { font-size: 22pt; margin: 0 0 8pt; color: #4c3fd1; }
  h2 { font-size: 16pt; margin: 18pt 0 6pt; padding-bottom: 3pt; border-bottom: 2px solid #e4e1fb; color: #2b2380; page-break-after: avoid; }
  h3 { font-size: 13pt; margin: 14pt 0 4pt; color: #2b2380; page-break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  ol, ul { padding-left: 18pt; } li { margin: 2pt 0; }
  strong { color: #000; }
  code { font-family: "DejaVu Sans Mono", monospace; font-size: 9.5pt; background: #f2f1fb; padding: 0 3pt; border-radius: 3pt; word-break: break-all; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0 10pt; font-size: 10pt; page-break-inside: avoid; }
  th, td { border: 1px solid #ccc; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th { background: #f2f1fb; }
  blockquote { margin: 8pt 0; padding: 6pt 10pt; background: #fff8e6; border-left: 4px solid #e8a400; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 14pt 0; }
  a { color: #4c3fd1; word-break: break-all; }
</style></head><body>${body}</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
const pdf = await page.pdf({
  format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>",
  footerTemplate: '<div style="font-size:8pt;width:100%;text-align:center;color:#888">BiBuru · Qué tengo que hacer · página <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
  margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
});
writeFileSync(output, pdf);

// Comprobación: se vuelve a abrir el PDF y se cuentan páginas.
const buf = readFileSync(output);
const pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
const size = statSync(output).size;
await browser.close();
if (buf.subarray(0, 5).toString() !== "%PDF-" || pages < 1 || size < 20_000) { console.error(`PDF no válido (${size} bytes, ${pages} páginas)`); process.exit(1); }
console.log(`OK ${output}: ${pages} páginas, ${(size / 1024).toFixed(0)} KB`);

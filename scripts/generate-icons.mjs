// Genera los iconos PNG de la PWA con Chromium (Playwright) a partir de la mascota
// (public/brand/mascot.svg). Uso: node scripts/generate-icons.mjs
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";

const exe = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const mascot = readFileSync("public/brand/mascot.svg", "utf8").replace(/<svg [^>]*>/, "").replace("</svg>", "");

// Fondo morado oscuro con un halo del color de acento; `scale` deja margen para recortes.
const svg = (size, scale) => `<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2B2462"/><stop offset="1" stop-color="#0E0B1F"/></linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.48" r="0.5"><stop offset="0" stop-color="#7B6CF6" stop-opacity="0.75"/><stop offset="1" stop-color="#7B6CF6" stop-opacity="0"/></radialGradient>
</defs>
<rect width="512" height="512" fill="url(#bg)"/>
<circle cx="256" cy="250" r="230" fill="url(#glow)"/>
<g transform="translate(256 262) scale(${scale}) translate(-100 -104)">${mascot}</g>
</svg></body></html>`;

const targets = [
  ["public/icons/icon-192.png", 192, 2.05],
  ["public/icons/icon-512.png", 512, 2.05],
  ["public/icons/icon-maskable-512.png", 512, 1.6], // zona segura para recortes
  ["public/icons/apple-touch-icon.png", 180, 2.0],
];

const browser = await chromium.launch({ executablePath: exe });
for (const [file, size, scale] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(svg(size, scale));
  writeFileSync(file, await page.screenshot({ type: "png" }));
  await page.close();
  console.log("OK", file);
}
await browser.close();

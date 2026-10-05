// Genera los iconos PNG de la PWA con Chromium (Playwright). Uso: node scripts/generate-icons.mjs
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const exe = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const svg = (size, pad) => `<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#0f766e"/>
<g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)">
<path d="M170 120h110c52 0 86 28 86 70 0 28-15 48-40 58 32 8 52 31 52 64 0 48-38 80-96 80H170z M222 162v62h52c24 0 38-12 38-31s-14-31-38-31z M222 266v84h60c26 0 42-13 42-42s-16-42-42-42z" fill="#f8f7f3" fill-rule="evenodd"/>
</g></svg></body></html>`;

const targets = [
  ["public/icons/icon-192.png", 192, 0],
  ["public/icons/icon-512.png", 512, 0],
  ["public/icons/icon-maskable-512.png", 512, 0.22], // zona segura para recortes
  ["public/icons/apple-touch-icon.png", 180, 0.06],
];

const browser = await chromium.launch({ executablePath: exe });
for (const [file, size, pad] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(svg(size, pad));
  writeFileSync(file, await page.screenshot({ type: "png" }));
  await page.close();
  console.log("OK", file);
}
await browser.close();

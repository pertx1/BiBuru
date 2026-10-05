// Genera los PDF de docs/ desde docs/src/*.html. Uso: node scripts/build-guides.mjs
import { chromium } from "playwright-core";
import { readdirSync } from "node:fs";
import path from "node:path";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
for (const f of readdirSync("docs/src").filter((f) => f.endsWith(".html"))) {
  const page = await browser.newPage();
  await page.goto("file://" + path.resolve("docs/src", f));
  const name = f.replace(/^fase-(\d+)\.html$/, "Fase-$1-Guia.pdf");
  await page.pdf({ path: `docs/${name}`, format: "A4", printBackground: true, displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#888">BiBuru · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
    margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" } });
  console.log("OK docs/" + name);
}
await browser.close();

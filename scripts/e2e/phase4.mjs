// Recorrido de la Fase 4: captura rápida (también sin conexión), bandeja, notas, carpetas, etiquetas y búsqueda.
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const out = process.env.OUT ?? "/tmp/shots4";
const base = "http://localhost:3100";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const mk = async (vp) => {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: vp.width < 600 ? 2 : 1, locale: "es-ES" });
  await ctx.addCookies([sessionCookie(process.env.USER_ID)]);
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && page.errors.push("console: " + m.text().slice(0, 200)));
  return { ctx, page };
};
const settle = async (page) => { await page.waitForSelector("h1, h2", { timeout: 8000 }); await page.waitForTimeout(700); };
const text = async (page) => { await settle(page); return (await page.locator("main").innerText()).replace(/\s+/g, " "); };

// ================= móvil
{
  const { ctx, page } = await mk({ width: 390, height: 844 });
  await page.goto(base + "/"); await settle(page);
  const t0 = Date.now();
  await page.getByRole("button", { name: "Captura rápida" }).click();
  await page.getByLabel("Texto de la captura").fill("Comprar etiquetas para las camisetas mañana a las 9");
  await page.screenshot({ path: `${out}/1-captura.png` });
  await page.keyboard.press("Enter");
  console.log("captura (abrir+escribir+guardar) ms:", Date.now() - t0, "(incluye pausas de Playwright)");
  await page.waitForTimeout(1500);
  await page.goto(base + "/bandeja");
  console.log("bandeja:", (await text(page)).slice(0, 260));
  await page.screenshot({ path: `${out}/2-bandeja.png` });
  await page.getByRole("button", { name: "Tarea", exact: true }).first().click(); await page.waitForTimeout(1500);
  await page.goto(base + "/tareas?v=7dias");
  console.log("tarea creada:", (await text(page)).includes("Comprar etiquetas") ? "sí" : "NO");

  // sin conexión
  await ctx.setOffline(true);
  await page.goto(base + "/bandeja").catch(() => {});
  await ctx.setOffline(false);
  await page.goto(base + "/"); await settle(page);
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.getByRole("button", { name: "Captura rápida" }).click();
  await page.getByLabel("Texto de la captura").fill("Idea apuntada sin conexión: pack de verano");
  await page.screenshot({ path: `${out}/3-offline.png` });
  await page.keyboard.press("Enter"); await page.waitForTimeout(800);
  console.log("pendientes tras guardar offline:", await page.getByLabel(/capturas sin enviar/).count());
  await page.screenshot({ path: `${out}/4-offline-guardada.png` });
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(2500);
  await page.goto(base + "/bandeja");
  const b = await text(page);
  console.log("tras volver la red, en bandeja:", b.includes("sin conexión") ? "sí (llegó)" : "NO", "| duplicados:", (b.match(/Idea apuntada sin conexión/g) ?? []).length);

  // notas
  await page.goto(base + "/notas"); await settle(page);
  await page.getByRole("button", { name: "Nueva carpeta" }).click();
  await page.getByLabel("Nueva carpeta").fill("Ideas"); await page.keyboard.press("Enter"); await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Nueva nota" }).click();
  await page.waitForURL(/\/notas\/[0-9a-f-]{36}/, { timeout: 10000 });
  await page.getByLabel("Título").fill("Plan de la colección de verano");
  await page.getByLabel("Contenido de la nota").fill("## Objetivos\n\n- Diseñar 5 camisetas nuevas\n- [ ] Elegir colores\n- [x] Hablar con la imprenta\n\n**Importante:** lanzar en junio.");
  await page.waitForTimeout(1500);
  await page.getByLabel("Añadir etiqueta").fill("verano"); await page.keyboard.press("Enter"); await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/5-nota-editor.png` });
  await page.getByRole("button", { name: "Vista previa" }).click(); await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/6-nota-preview.png` });
  const noteUrl = page.url();
  await page.reload(); await page.waitForSelector("textarea"); await page.waitForTimeout(500);
  console.log("nota persistida:", (await page.getByLabel("Título").inputValue()), "|", (await page.getByLabel("Contenido de la nota").inputValue()).length, "caracteres");
  await page.goto(base + "/notas"); await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/7-notas.png` });

  // búsqueda
  await page.getByRole("button", { name: "Buscar", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Buscar" }).fill("colecci");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/8-busqueda.png` });
  console.log("resultados «colecci»:", (await page.getByRole("listbox").innerText()).replace(/\s+/g, " ").slice(0, 160));
  await page.keyboard.press("Enter"); await page.waitForTimeout(1500);
  console.log("abre la nota:", page.url() === noteUrl);
  console.log("errores móvil:", JSON.stringify(page.errors));
  await ctx.close();
}

// ================= escritorio: arrastrar y soltar + Ctrl+K
{
  const { ctx, page } = await mk({ width: 1280, height: 800 });
  await page.goto(base + "/notas"); await settle(page);
  const nb = await page.getByRole("link", { name: /Plan de la colección/ }).boundingBox();
  const fb = await page.getByRole("link", { name: /Ideas/ }).first().boundingBox();
  // Movimiento de ratón realista (dragTo es demasiado brusco para el DnD nativo de Chromium).
  await page.mouse.move(nb.x + 100, nb.y + 20); await page.mouse.down();
  await page.mouse.move(nb.x + 60, nb.y + 30, { steps: 5 });
  await page.mouse.move(fb.x + 40, fb.y + 20, { steps: 15 });
  await page.mouse.move(fb.x + 44, fb.y + 22, { steps: 3 });
  await page.mouse.up(); await page.waitForTimeout(1500);
  await page.getByRole("link", { name: /Ideas/ }).first().click(); await page.waitForTimeout(1000);
  console.log("tras arrastrar, carpeta Ideas contiene:", (await text(page)).includes("Plan de la colección") ? "la nota ✔" : "NADA");
  await page.screenshot({ path: `${out}/9-notas-escritorio.png` });
  await page.keyboard.press("Control+k"); await page.waitForTimeout(300);
  await page.getByRole("textbox", { name: "Buscar" }).fill("camisetas");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/10-ctrlk.png` });
  console.log("Ctrl+K «camisetas»:", (await page.getByRole("listbox").innerText()).replace(/\s+/g, " ").slice(0, 200));
  console.log("errores escritorio:", JSON.stringify(page.errors));
  await ctx.close();
}
await browser.close();

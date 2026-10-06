// Revisión móvil: recorre las pantallas principales a 375, 390 y 430 px (iPhone emulado) y comprueba
// desplazamiento horizontal, zonas táctiles < 44 px, campos con letra < 16 px (zoom en iOS) y elementos que se salen.
// Uso: USER_ID=<uuid> BIZ=<uuid> NOTE=<uuid> GOAL=<uuid> [SHOTS=docs/movil/antes] [STRICT=1] node scripts/e2e/mobile-audit.mjs
// Con STRICT=1 falla (código 1) si alguna pantalla tiene desplazamiento horizontal.
// WebKit no está disponible en este entorno: se emula iPhone (agente, táctil, DPR 3) con Chromium.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { sessionCookie } from "./session.mjs";

const base = process.env.BASE ?? "http://localhost:3100";
const { BIZ, NOTE, GOAL } = process.env;
export const ROUTES = [
  ["inicio", "/"], ["tareas", "/tareas"], ["calendario", "/calendario"], ["objetivos", "/objetivos"], ["objetivo", `/objetivos/${GOAL}`],
  ["noticias", "/noticias"], ["notas", "/notas"], ["nota", `/notas/${NOTE}`], ["favoritos", "/favoritos"], ["bandeja", "/bandeja"],
  ["chat", "/chat"], ["ajustes", "/ajustes"], ["mas", "/mas"], ["negocios", "/negocios"], ["negocio", `/negocios/${BIZ}`],
  ["pedidos", `/negocios/${BIZ}/pedidos`], ["deudas", `/negocios/${BIZ}/pedidos?vista=deudas`], ["gastos", `/negocios/${BIZ}/gastos`],
  ["ingresos", `/negocios/${BIZ}/ingresos`], ["productos", `/negocios/${BIZ}/productos`], ["stock", `/negocios/${BIZ}/stock`],
  ["estadisticas", `/negocios/${BIZ}/estadisticas`], ["negocio-tareas", `/negocios/${BIZ}/tareas`], ["negocio-objetivos", `/negocios/${BIZ}/objetivos`],
  ["produccion", `/negocios/${BIZ}/produccion`], ["bolsa", `/negocios/${BIZ}/produccion/bolsa`], ["reglas", `/negocios/${BIZ}/produccion/reglas`], ["facturas", `/negocios/${BIZ}/produccion/facturas`],
];
const WIDTHS = (process.env.WIDTHS ?? "375,390,430").split(",").map(Number);
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const report = [];
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA, locale: "es-ES", colorScheme: "dark" });
  await ctx.addCookies([sessionCookie(process.env.USER_ID)]);
  const page = await ctx.newPage();
  for (const [name, path] of ROUTES) {
    await page.goto(base + path, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const vw = window.innerWidth;
      const visible = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && b.width > 0 && b.height > 0; };
      const desc = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""} «${(el.textContent ?? "").trim().slice(0, 30)}»`;
      // Elementos que se salen por la derecha (sin contar los que están dentro de un contenedor con scroll horizontal propio).
      const inScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") return true; } return false; };
      const overflow = [...document.querySelectorAll("body *")].filter((el) => visible(el) && el.getBoundingClientRect().right > vw + 1 && !inScroller(el)).slice(0, 8).map(desc);
      const targets = [...document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=button], summary")]
        .filter((el) => visible(el) && !el.closest("dialog:not([open])"))
        .filter((el) => { const b = el.getBoundingClientRect(); const lbl = el.closest("label"); const lb = lbl?.getBoundingClientRect(); return (b.height < 43.5 && !(lb && lb.height >= 43.5)) && el.type !== "checkbox" && el.type !== "radio"; })
        .slice(0, 12).map((el) => `${desc(el)} ${Math.round(el.getBoundingClientRect().height)}px`);
      const smallInputs = [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea")]
        .filter((el) => visible(el) && parseFloat(getComputedStyle(el).fontSize) < 16).slice(0, 8).map((el) => `${desc(el)} ${getComputedStyle(el).fontSize}`);
      return { hScroll: document.documentElement.scrollWidth > vw + 1, scrollWidth: document.documentElement.scrollWidth, overflow, targets, smallInputs };
    });
    report.push({ width, name, path, ...r });
    if (shots && width === 390) await page.screenshot({ path: `${shots}/${name}.jpg`, type: "jpeg", quality: 55, fullPage: true });
  }
  await ctx.close();
}
await browser.close();

const bad = report.filter((r) => r.hScroll);
for (const r of report) {
  const issues = [r.hScroll && `scroll horizontal (${r.scrollWidth}px)`, r.overflow.length && `se salen: ${r.overflow.join(", ")}`, r.targets.length && `táctiles <44px: ${r.targets.length}`, r.smallInputs.length && `letra <16px: ${r.smallInputs.length}`].filter(Boolean);
  if (issues.length) console.log(`${r.width} ${r.name}: ${issues.join(" · ")}`);
}
if (process.env.REPORT) writeFileSync(process.env.REPORT, JSON.stringify(report, null, 2));
console.log(bad.length ? `FALLO: ${bad.length} pantallas con scroll horizontal` : "OK: ninguna pantalla con scroll horizontal");
if (process.env.STRICT && bad.length) process.exit(1);

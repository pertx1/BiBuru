// Gestos táctiles: deslizar una tarea a la derecha (hecha) y a la izquierda (mañana).
// Uso: USER_ID=<uuid> node scripts/e2e/gestures.mjs  (con scripts/e2e/up.sh levantado y alguna tarea para hoy)
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-ES" });
await ctx.addCookies([sessionCookie(process.env.USER_ID)]);
const page = await ctx.newPage();
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };

async function swipe(locator, dx) {
  const b = await locator.boundingBox();
  const y = b.y + b.height / 2, x0 = b.x + b.width / 2;
  await page.evaluate(({ x0, y, dx }) => {
    const el = document.elementFromPoint(x0, y);
    const t = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [t(x0)], changedTouches: [t(x0)] }));
    for (let i = 1; i <= 8; i++) el.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, touches: [t(x0 + (dx * i) / 8)], changedTouches: [t(x0 + (dx * i) / 8)] }));
    el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [t(x0 + dx)] }));
  }, { x0, y, dx });
}

for (const t of ["Gesto hecha", "Gesto mañana"]) {
  await page.goto("http://localhost:3100/tareas", { waitUntil: "networkidle" });
  await page.getByLabel("Nueva tarea").fill(`${t} hoy`);
  await page.getByRole("button", { name: "Añadir tarea" }).click();
  await page.waitForTimeout(1200);
}
await page.goto("http://localhost:3100/tareas", { waitUntil: "networkidle" });
await swipe(page.getByText("Gesto hecha", { exact: true }), 150);
await page.waitForTimeout(1500);
ok(await page.getByRole("status").getByText("Hecha ✔").isVisible().catch(() => false) || !(await page.getByText("Gesto hecha", { exact: true }).isVisible()), "deslizar a la derecha completa la tarea");
await swipe(page.getByText("Gesto mañana", { exact: true }), -150);
await page.waitForTimeout(1500);
ok(await page.getByText("Pospuesta a mañana").isVisible(), "deslizar a la izquierda la pospone a mañana");
await page.goto("http://localhost:3100/tareas", { waitUntil: "networkidle" });
ok(!(await page.getByText("Gesto mañana", { exact: true }).count()), "ya no está en Hoy");
await browser.close();

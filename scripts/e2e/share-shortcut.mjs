// Atajo de iPhone «Compartir → BiBuru»: crear la clave en Favoritos y simular las peticiones del atajo.
// Uso: USER_ID=<uuid> node scripts/e2e/share-shortcut.mjs  (con scripts/e2e/up.sh levantado)
import pg from "pg";
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const base = "http://localhost:3100";
const db = new pg.Client({ connectionString: "postgres://postgres:postgres@localhost:5432/biburu_test" });
await db.connect();
const q = (s, p) => db.query(s, p);
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };
const ws = (await q("select default_workspace_id id from profiles where user_id=$1", [process.env.USER_ID])).rows[0].id;
await q("delete from saved_videos where workspace_id=$1", [ws]);
await q("delete from share_tokens where user_id=$1", [process.env.USER_ID]);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", timezoneId: "Europe/Madrid" });
await ctx.addCookies([sessionCookie(process.env.USER_ID)]);
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${base}/favoritos`, { waitUntil: "networkidle" });
await page.getByText("Atajo de iPhone: Compartir → BiBuru").click();
await page.getByRole("button", { name: "Crear mi clave" }).click();
await page.getByText(/cópiala ahora/).waitFor();
const fields = await page.locator("p.font-mono").allTextContents();
const token = fields.find((t) => t.startsWith("bb_"));
const endpoint = fields.find((t) => t.endsWith("/api/compartir"));
ok(!!token && token.length > 30, "crea la clave y la enseña una vez");
ok(endpoint === `${base}/api/compartir`, `muestra la dirección: ${endpoint}`);
ok((await q("select token_hash from share_tokens where user_id=$1", [process.env.USER_ID])).rows[0].token_hash !== token, "en la BD solo se guarda el hash");
await page.screenshot({ path: process.env.SHOT ?? "/tmp/share-shortcut.png", fullPage: true });

// Lo que manda el atajo (Obtener contenido de URL, POST, JSON) con el texto que comparte TikTok.
const send = (body, type = "json") => fetch(endpoint, type === "json"
  ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  : { method: "POST", body: new URLSearchParams(body) }).then(async (r) => ({ status: r.status, text: await r.text() }));
let r = await send({ clave: token, enlace: "Mira este vídeo de @akerra en TikTok https://www.tiktok.com/@akerra/video/7234567890123456789?_t=8abc&_r=1" });
ok(r.status === 200 && /Guardado en BiBuru ✔/.test(r.text), `guarda desde el atajo: «${r.text}»`);
ok((await q("select count(*)::int n from saved_videos where workspace_id=$1 and external_id='7234567890123456789'", [ws])).rows[0].n === 1, "el vídeo está en Favoritos");
r = await send({ clave: token, enlace: "https://www.tiktok.com/@akerra/video/7234567890123456789" });
ok(r.status === 200 && /Ya estaba/.test(r.text), "no lo repite");
r = await send({ clave: token, enlace: "https://youtu.be/dQw4w9WgXcQ" }, "form");
ok(r.status === 200 && /Guardado/.test(r.text), "también YouTube y en formato formulario");
r = await send({ clave: "bb_clave_inventada_que_no_existe", enlace: "https://youtu.be/aaaaaaaaaaa" });
ok(r.status === 401 && /Clave no válida/.test(r.text), "clave inventada: 401");
r = await send({ clave: token, enlace: "hola sin enlace" });
ok(/No he encontrado ningún enlace/.test(r.text), "sin enlace: lo dice");
r = await send({ enlace: "https://youtu.be/bbbbbbbbbbb" });
ok(r.status === 400, "sin clave: 400");
ok((await q("select uses from share_tokens where user_id=$1", [process.env.USER_ID])).rows[0].uses === 4, "cuenta los usos");

// Borrar la clave corta el atajo al momento.
await page.reload({ waitUntil: "networkidle" });
await page.getByText("Atajo de iPhone: Compartir → BiBuru").click();
ok(await page.getByText(/usada 4 veces/).isVisible(), "muestra cuándo se usó");
page.once("dialog", (d) => d.accept());
await page.getByRole("button", { name: "Borrar clave" }).click();
await page.getByText("Clave borrada").waitFor();
r = await send({ clave: token, enlace: "https://youtu.be/ccccccccccc" });
ok(r.status === 401, "borrada: deja de funcionar");
ok(errors.length === 0, `sin errores de JavaScript ${errors.join(" | ")}`);
await browser.close(); await db.end();

// Proyectos: categorías con subcategorías (IA › Claude), con sus tareas, notas y vídeos; filtros de Favoritos por árbol.
// Uso: USER_ID=<uuid> node scripts/e2e/proyectos.mjs  (con scripts/e2e/up.sh levantado)
import pg from "pg";
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const base = "http://localhost:3100";
const db = new pg.Client({ connectionString: "postgres://postgres:postgres@localhost:5432/biburu_test" });
await db.connect();
const q = (s, p) => db.query(s, p);
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };
const U = process.env.USER_ID;
const ws = (await q("select default_workspace_id id from profiles where user_id=$1", [U])).rows[0].id;
await q("delete from video_categories where workspace_id=$1", [ws]);
await q("delete from saved_videos where workspace_id=$1", [ws]);
await q("delete from tasks where workspace_id=$1", [ws]);
await q("delete from notes where workspace_id=$1", [ws]);
const cat = (name, parent = null, pinned = true) => q("insert into video_categories (workspace_id,user_id,name,parent_id,pinned) values ($1,$2,$3,$4,$5) returning id", [ws, U, name, parent, pinned]).then((r) => r.rows[0].id);
const pn = await cat("Posibles negocios"), ia = await cat("IA"), claude = await cat("Claude", ia), otras = await cat("Otras IA", ia);
const vid = (title, c, ext) => q("insert into saved_videos (workspace_id,user_id,source,external_id,url,title,category_id,analysis_status,summary,utility) values ($1,$2,'youtube',$5,$3,$4,$6,'ready','Resumen',4)", [ws, U, `https://www.youtube.com/watch?v=${ext}`, title, ext, c]);
await vid("Claude Code en 10 minutos", claude, "aaaaaaaaaa1"); await vid("Comparativa de IAs", otras, "aaaaaaaaaa2"); await vid("Vender camisetas online", pn, "aaaaaaaaaa3");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", timezoneId: "Europe/Madrid" });
await ctx.addCookies([sessionCookie(U)]);
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const noScroll = async (what) => ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${what}: sin scroll horizontal`);

await page.goto(`${base}/proyectos`, { waitUntil: "networkidle" });
let t = await page.locator("main").innerText();
ok(/Posibles negocios/.test(t) && /› Claude/.test(t) && /› Otras IA/.test(t), "árbol: Posibles negocios, IA › Claude, IA › Otras IA");
ok(/2 vídeos/.test(t), "IA cuenta los vídeos de sus subcategorías");
await noScroll("Proyectos");
await page.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/proyectos.png`, fullPage: true });

// Proyecto IA: subcategorías, vídeos de dentro, tarea rápida y nota.
await page.getByRole("link", { name: /^📌 IA/ }).click();
await page.waitForURL(/\/proyectos\//);
await page.waitForLoadState("networkidle");
t = await page.locator("main").innerText();
ok(/Claude Code en 10 minutos/.test(t) && /Comparativa de IAs/.test(t) && !/Vender camisetas/.test(t), "IA muestra los vídeos de Claude y Otras IA");
await page.getByLabel("Descripción del proyecto").fill("Aprender a usar IA para el negocio");
await page.getByLabel("Nueva tarea del proyecto").fill("Probar Claude Code con BiBuru");
await page.getByLabel("Nueva tarea del proyecto").press("Enter");
await page.getByText("Probar Claude Code con BiBuru").waitFor();
ok((await q("select category_id from tasks where title='Probar Claude Code con BiBuru'")).rows[0].category_id === ia, "tarea rápida dentro del proyecto");
ok((await q("select description from video_categories where id=$1", [ia])).rows[0].description === "Aprender a usar IA para el negocio", "descripción guardada al salir del campo");
await page.getByLabel("Nueva subcategoría").fill("Gemini");
await page.getByLabel("Nueva subcategoría").press("Enter");
await page.getByRole("link", { name: /^Gemini/ }).waitFor();
ok((await q("select parent_id from video_categories where name='Gemini' and workspace_id=$1", [ws])).rows[0].parent_id === ia, "subcategoría nueva dentro de IA");
await noScroll("Proyecto");
await page.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/proyecto-ia.png`, fullPage: true });
await page.getByRole("button", { name: "Nueva nota" }).click();
await page.waitForURL(/\/notas\//);
await page.waitForLoadState("networkidle");
ok(await page.getByLabel(/Categoría \(proyecto\)/).inputValue() === ia, "la nota nueva nace en el proyecto y su editor deja cambiarla");
await page.getByLabel(/Categoría \(proyecto\)/).selectOption(claude);
await page.waitForTimeout(1000);
const noteId = new URL(page.url()).pathname.split("/").pop();
ok((await q("select category_id from notes where id=$1", [noteId])).rows[0].category_id === claude, "cambiar la categoría de una nota");

// Tareas: el formulario tiene la categoría.
await page.goto(`${base}/tareas/nueva?categoria=${claude}`, { waitUntil: "networkidle" });
ok(await page.getByLabel(/Categoría \(proyecto\)/).inputValue() === claude, "nueva tarea con ?categoria=");

// Favoritos: elegir IA enseña sus subcategorías y filtra con ellas.
await page.goto(`${base}/favoritos?estado=todos&cat=${ia}`, { waitUntil: "networkidle" });
t = await page.locator("main").innerText();
ok(/Claude Code en 10 minutos/.test(t) && /Comparativa de IAs/.test(t) && !/Vender camisetas/.test(t), "Favoritos: IA incluye sus subcategorías");
ok(await page.getByRole("navigation", { name: "Dentro de IA" }).getByRole("link", { name: /Claude/ }).isVisible(), "chips de subcategorías al elegir IA");
await page.getByRole("navigation", { name: "Dentro de IA" }).getByRole("link", { name: /Claude/ }).click();
await page.waitForURL((u) => u.searchParams.get("cat") === claude);
await page.getByText("Comparativa de IAs").waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
t = await page.locator("main").innerText();
ok(/Claude Code en 10 minutos/.test(t) && !/Comparativa de IAs/.test(t), "y al elegir Claude, solo Claude");
await noScroll("Favoritos");
await page.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/favoritos-arbol.png`, fullPage: true });
await page.goto(`${base}/mas`, { waitUntil: "networkidle" });
ok(await page.locator("main").getByRole("link", { name: /Proyectos/ }).isVisible(), "Proyectos en «Más»");
ok(errors.length === 0, `sin errores de JavaScript ${errors.join(" | ")}`);
await browser.close(); await db.end();

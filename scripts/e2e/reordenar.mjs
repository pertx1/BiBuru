// Reordenar categorías de vídeos ya analizados (sin volver a analizarlos). Gemini falso que lleva lo de IA a «IA › Claude» / «IA › Gemini».
// Uso: USER_ID=<uuid> node scripts/e2e/reordenar.mjs  (con scripts/e2e/up.sh levantado; usa el puerto 9500)
import http from "node:http";
import pg from "pg";
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const base = "http://localhost:3100";
const db = new pg.Client({ connectionString: "postgres://postgres:postgres@localhost:5432/biburu_test" });
await db.connect();
const q = (s, p) => db.query(s, p);
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const U = process.env.USER_ID;
const ws = (await q("select default_workspace_id id from profiles where user_id=$1", [U])).rows[0].id;
for (const t of ["saved_videos", "video_categories", "ai_usage"]) await q(`delete from ${t} where workspace_id=$1`, [ws]);
const cat = (name, parent = null) => q("insert into video_categories (workspace_id,user_id,name,parent_id,pinned) values ($1,$2,$3,$4,true) returning id", [ws, U, name, parent]).then((r) => r.rows[0].id);
const ecom = await cat("E-commerce"), ia = await cat("IA");
await cat("Claude", ia);
const vid = (title, summary, c, manual = false) => q("insert into saved_videos (workspace_id,user_id,source,url,title,summary,category_id,analysis_status,category_manual) values ($1,$2,'other',$3,$4,$5,$6,'ready',$7) returning id",
  [ws, U, `https://x.test/${Math.random()}`, title, summary, c, manual]).then((r) => r.rows[0].id);
const v1 = await vid("Claude Code para tu tienda online", "Cómo usar Claude para automatizar una tienda de Shopify.", ecom);
const v2 = await vid("Gemini para descripciones de producto", "Usar Gemini para escribir fichas de producto.", ecom);
const v3 = await vid("Cómo bajar el coste de envío", "Estrategias logísticas para ecommerce.", ecom);
const v4 = await vid("Claude vs ChatGPT", "Comparativa de IAs.", ecom, true); // elegido a mano: no se toca

let calls = 0, sawPaths = "";
const gemini = http.createServer((req, res) => {
  let raw = ""; req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    const sys = body.systemInstruction?.parts?.map((p) => p.text).join("") ?? "";
    const text = (body.contents ?? []).flatMap((c) => c.parts ?? []).map((p) => p.text ?? "").join("\n");
    calls++; sawPaths = sys;
    const items = [...text.matchAll(/^([0-9a-f-]{36}) \| (.+)$/gm)].map(([, id, rest]) => ({ id, category: /Claude/.test(rest) ? "IA › Claude" : /Gemini/.test(rest) ? "IA › Gemini" : "E-commerce" }));
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify({ items }) }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120 } }));
  });
});
await new Promise((r) => gemini.listen(9500, r));

// Abrir Favoritos lanza el reordenado (después de enviar la página).
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES" });
await ctx.addCookies([sessionCookie(U)]);
const page = await ctx.newPage();
await page.goto(`${base}/favoritos?estado=todos`, { waitUntil: "networkidle" });
const catOf = async (id) => (await q("select c.name, p.name parent from saved_videos v left join video_categories c on c.id=v.category_id left join video_categories p on p.id=c.parent_id where v.id=$1", [id])).rows[0];
for (let i = 0; i < 40; i++) { if ((await q("select count(*)::int n from saved_videos where workspace_id=$1 and recategorized_at is null and not category_manual", [ws])).rows[0].n === 0) break; await sleep(500); }
ok(/IA › Claude/.test(sawPaths) && /aunque se aplique a vender/.test(sawPaths), "la IA ve el árbol y la regla de IA");
ok(calls === 1, `una sola llamada para todos (${calls})`);
let c = await catOf(v1); ok(c.name === "Claude" && c.parent === "IA", "Claude Code para tu tienda → IA › Claude (no E-commerce)");
c = await catOf(v2); ok(c.name === "Gemini" && c.parent === "IA", "Gemini → nueva IA › Gemini, dentro de IA");
c = await catOf(v3); ok(c.name === "E-commerce", "lo que es de e-commerce se queda");
c = await catOf(v4); ok(c.name === "E-commerce", "lo elegido a mano no se toca");
ok((await q("select feature from ai_usage where workspace_id=$1", [ws])).rows.every((r) => r.feature === "recategorize"), "gasto apuntado como «Reordenar categorías»");

// Elegir a mano en la ficha la fija; el botón vuelve a ordenar todo lo demás.
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /Categorías/ }).first().click();
await page.getByRole("button", { name: "Reordenar vídeos con IA" }).click();
await page.getByText(/Reordenando 3 vídeos/).waitFor();
ok(true, "el botón reordena los 3 no elegidos a mano");
for (let i = 0; i < 40 && calls < 2; i++) await sleep(500);
ok(calls === 2, "y vuelve a llamar a la IA");
await browser.close(); gemini.close(); await db.end();

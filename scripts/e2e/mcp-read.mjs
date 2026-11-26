// Conector de Claude: «verlo todo». Siembra un negocio con pedidos, cobros, gastos, stock, evento, objetivo, vídeo, nota,
// cuenta de Instagram con publicación, noticias y revisión, y llama a cada herramienta de lectura como lo haría Claude.
// Uso: USER_ID=<uuid> node scripts/e2e/mcp-read.mjs  (con scripts/e2e/up.sh levantado)
import { createHash } from "node:crypto";
import pg from "pg";

const base = "http://localhost:3100";
const db = new pg.Client({ connectionString: "postgres://postgres:postgres@localhost:5432/biburu_test" });
await db.connect();
const q = async (s, p) => (await db.query(s, p)).rows;
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };
const U = process.env.USER_ID;
const ws = (await q("select default_workspace_id id from profiles where user_id=$1", [U]))[0].id;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
await q("delete from businesses where workspace_id=$1 and name in ('Ver Todo SL','Otro SL')", [ws]);
await q("delete from social_accounts where workspace_id=$1", [ws]);
await q("delete from mcp_tokens where user_id=$1", [U]);

// Clave del conector (como si se hubiera generado en Ajustes).
const token = `bm_${"k".repeat(40)}`;
await q("insert into mcp_tokens (workspace_id,user_id,token_hash) values ($1,$2,$3)", [ws, U, createHash("sha256").update(token).digest("hex")]);

const biz = (await q("insert into businesses (workspace_id,user_id,name,production_enabled) values ($1,$2,'Ver Todo SL',true) returning id", [ws, U]))[0].id;
const other = (await q("insert into businesses (workspace_id,user_id,name) values ($1,$2,'Otro SL') returning id", [ws, U]))[0].id;
const order = async (b, customer, status, cents, paid, date = today) => {
  const id = (await q("insert into orders (workspace_id,user_id,business_id,order_date,status,customer,channel,payment_reviewed) values ($1,$2,$3,$4,$5,$6,'Instagram',true) returning id", [ws, U, b, date, status, customer]))[0].id;
  await q("insert into order_items (workspace_id,user_id,order_id,product_name,color,size,garment,quantity,unit_price_cents,unit_cost_cents) values ($1,$2,$3,'Eguzkilore','Gris','M','sudadera',1,$4,1200)", [ws, U, id, cents]);
  if (paid) await q("insert into order_payments (workspace_id,user_id,order_id,paid_on,amount_cents,method) values ($1,$2,$3,$4,$5,'bizum')", [ws, U, id, date, paid]);
  return id;
};
const o1 = await order(biz, "Ane", "sin_hacer", 3500, 1000);
await order(biz, "Mikel", "enviado", 2500, 2500);
await order(other, "Otra persona", "enviado", 9900, 9900);
const cat = (await q("insert into expense_categories (workspace_id,user_id,name) values ($1,$2,'Material e2e') on conflict do nothing returning id", [ws, U]))[0]?.id
  ?? (await q("select id from expense_categories where workspace_id=$1 and name='Material e2e'", [ws]))[0].id;
await q("insert into expenses (workspace_id,user_id,business_id,expense_date,amount_cents,concept,supplier,category_id) values ($1,$2,$3,$4,1500,'Sudaderas lisas','Proveedor X',$5)", [ws, U, biz, today, cat]);
await q("insert into tshirt_stocks (workspace_id,user_id,business_id,model,size,quantity,min_quantity) values ($1,$2,$3,'Sudadera gris','M',0,2),($1,$2,$3,'Negra','L',8,2)", [ws, U, biz]);
await q("insert into events (workspace_id,user_id,title,start_date,end_date,start_time,end_time,all_day,location) values ($1,$2,'Feria de Durango',$3::date + 2,$3::date + 2,'10:00','14:00',false,'Durango')", [ws, U, today]);
await q("insert into goals (workspace_id,user_id,business_id,title,measure_type,target_value,auto_source,period_start) values ($1,$2,$3,'Vender 100 € este mes','euros',10000,'income',$4)", [ws, U, biz, today.slice(0, 8) + "01"]);
await q("insert into saved_videos (workspace_id,user_id,url,source,title,summary,status,key_points,actions,analysis_status) values ($1,$2,'https://www.youtube.com/watch?v=e2eREAD1','youtube','Cómo vender sudaderas','Truco de fotos de producto','por_ver','[\"Luz natural\"]','[\"Hacer fotos en la ventana\"]','ready') on conflict do nothing", [ws, U]);
await q("insert into notes (workspace_id,user_id,title,body) values ($1,$2,'Ideas e2e lectura','Probar packaging reciclado')", [ws, U]);
const acc = (await q("insert into social_accounts (workspace_id,user_id,business_id,platform,external_id,username,access_token_enc,followers_count) values ($1,$2,$3,'instagram','e2e-read','vertodo_ig','x',1234) returning id", [ws, U, biz]))[0].id;
await q("insert into social_posts (workspace_id,user_id,business_id,title,caption,scheduled_at,status) values ($1,$2,$3,'Lanzamiento sudadera','x',now() + interval '1 day','programada')", [ws, U, biz]);
await q("insert into social_media (workspace_id,account_id,external_id,caption,posted_at,views,likes,comments,shares,interactions) values ($1,$2,'m-read','Reel sudadera gris',now() - interval '2 days',5400,320,12,8,340)", [ws, acc]);
await q("delete from news_digests where user_id=$1 and day=$2", [U, today]);
await q("insert into news_digests (workspace_id,user_id,day,status,content) values ($1,$2,$3,'ai',$4)", [ws, U, today, JSON.stringify({ top: ["Instagram cambia el algoritmo de Reels"], items: [{ itemId: "1", title: "Reels más largos", url: "https://example.com/n", outlet: "Medio", author: null, kind: "rss", label: "", imageUrl: null, topic: null, score: 4, summary: "Ahora hasta 3 min.", action: "Prueba un reel de 90 s", business: null, unverified: false, coverage: 1 }], idea: null, closest: [], candidates: 5, note: null })]);
await q("delete from reviews where user_id=$1", [U]);
await q("insert into reviews (workspace_id,user_id,kind,period_start,period_end,ai_summary,priorities,data) values ($1,$2,'semanal',$3::date - 7,$3::date - 1,'Semana buena en Ver Todo SL',array['Reponer sudadera gris M'],'{}')", [ws, U, today]);

let id = 0;
const call = async (name, args = {}) => {
  const r = await fetch(`${base}/api/mcp/${token}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) });
  const j = await r.json();
  if (j.error) throw new Error(`${name}: ${j.error.message}`);
  return { text: j.result.content[0].text, error: j.result.isError };
};
const tools = (await (await fetch(`${base}/api/mcp/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "tools/list" }) })).json()).result.tools;
const names = tools.map((t) => t.name);
ok(["listar_negocios", "resumen_negocio", "listar_pedidos", "ver_pedido", "quien_me_debe", "listar_gastos", "ver_stock", "ver_calendario", "listar_objetivos", "ver_redes", "listar_videos", "ver_video", "listar_notas", "ver_noticias", "ver_revision", "estadisticas_mensuales", "crear_tarea"].every((n) => names.includes(n)), `${names.length} herramientas`);
ok(tools.every((t) => t.inputSchema?.type === "object"), "todas con esquema de entrada válido");

const check = async (name, args, ...expect) => {
  const r = await call(name, args);
  const miss = expect.filter((e) => !(e instanceof RegExp ? e.test(r.text) : r.text.includes(e)));
  ok(!r.error && !miss.length, `${name} ${miss.length ? `→ falta ${miss.join(", ")}\n${r.text}` : ""}`);
  return r.text;
};
await check("listar_negocios", {}, "Ver Todo SL: ventas 60,00", "te deben 25,00", "Otro SL");
await check("resumen_negocio", { negocio: "ver todo", periodo: "mes" }, "Ventas: 60,00", "Gastos: 15,00", "Beneficio: 45,00", "Eguzkilore", "Material e2e", "Sin hacer 1", "Te deben: 25,00");
await check("resumen_negocio", { periodo: "mes" }, "Todos los negocios", "Ventas: 159,00");
await check("estadisticas_mensuales", { meses: 2 }, today.slice(0, 7));
const pedidos = await check("listar_pedidos", { negocio: "Ver Todo SL", estado: "abiertos" }, "Ane", "FALTA COBRAR 25,00", "(sudadera)");
ok(!pedidos.includes("Mikel"), "«abiertos» no incluye los enviados");
await check("listar_pedidos", { con_deuda: true }, "1 pedidos");
await check("listar_pedidos", { buscar: "eguzkilore", negocio: "otro" }, "Otra persona");
await check("ver_pedido", { id: o1 }, "Cliente: Ane", "cobrado 10,00", "bizum");
await check("quien_me_debe", {}, "Ane: 25,00");
await check("listar_gastos", { negocio: "Ver Todo SL" }, "Sudaderas lisas", "Proveedor X", "Material e2e", "15,00");
await check("ver_stock", { negocio: "Ver Todo SL" }, "Sudadera gris M: 0 (mín. 2) ⚠️ PEDIR", "Camiseta negra L: 8");
const pedir = await check("ver_stock", { negocio: "Ver Todo SL", solo_pedir: true }, "Sudadera gris M");
ok(!pedir.includes("Camiseta negra L"), "«solo pedir» filtra");
await check("ver_calendario", {}, "Feria de Durango", "10:00", "Lanzamiento sudadera");
await check("listar_objetivos", {}, "Vender 100 € este mes", /60,00\s€ de 100,00\s€/, "60 %");
await check("ver_redes", { negocio: "Ver Todo SL" }, "@vertodo_ig · 1234 seguidores", "Lanzamiento sudadera", "Reel sudadera gris", "👁 5400");
const vids = await check("listar_videos", { buscar: "sudaderas" }, "Cómo vender sudaderas", "Truco de fotos");
await check("ver_video", { id: /id: ([0-9a-f-]{36})/.exec(vids)[1] }, "Luz natural", "Hacer fotos en la ventana");
await check("listar_notas", { buscar: "packaging" }, "Ideas e2e lectura");
await check("ver_noticias", {}, "Instagram cambia el algoritmo", "Prueba un reel de 90 s");
await check("ver_revision", { tipo: "semanal" }, "Semana buena", "Reponer sudadera gris M");
const bad = await call("listar_gastos", { desde: "cuando sea" });
ok(bad.error && /No entiendo las fechas/.test(bad.text), "fecha mala → error legible");
ok((await call("ver_stock", { negocio: "No existe" })).error, "negocio que no existe → error con la lista de negocios");

// Otro usuario no ve nada de esto con su clave.
const other_u = (await q("insert into auth.users (email) values ('ajeno-e2e@x.com') returning id"))[0].id;
const otherWs = (await q("select default_workspace_id id from profiles where user_id=$1", [other_u]))[0].id;
const token2 = `bm_${"z".repeat(40)}`;
await q("insert into mcp_tokens (workspace_id,user_id,token_hash) values ($1,$2,$3)", [otherWs, other_u, createHash("sha256").update(token2).digest("hex")]);
const r2 = await (await fetch(`${base}/api/mcp/${token2}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "listar_pedidos", arguments: {} } }) })).json();
ok(/No hay pedidos/.test(r2.result.content[0].text), "con la clave de otra persona no se ven tus pedidos");
await q("delete from auth.users where id=$1", [other_u]);
await q("delete from businesses where id in ($1,$2)", [biz, other]);
await db.end();

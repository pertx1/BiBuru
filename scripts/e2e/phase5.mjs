// Recorrido de la Fase 5: cron de avisos con un "servicio push" local HTTPS que descifra los avisos de verdad.
import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import pg from "pg";
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const USER_ID = process.env.USER_ID;
const base = "http://localhost:3100";
const CRON = "test-cron-secret-0123456789abcdef";
const db = new pg.Client({ connectionString: "postgres://postgres:postgres@localhost:5432/biburu_test" });
await db.connect();
const q = (s, p) => db.query(s, p);

// ------------ "servicio push" local: recibe, descifra (RFC 8291) y responde según la ruta
const received = [];
const hits = { flaky: 0 };
const subs = {};
function makeSub(name) {
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  subs[name] = { ecdh, auth: crypto.randomBytes(16) };
  return { endpoint: `https://localhost:9443/push/${name}`, p256dh: ecdh.getPublicKey().toString("base64url"), auth: subs[name].auth.toString("base64url") };
}
function decrypt(name, body) {
  const { ecdh, auth } = subs[name];
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPub = body.subarray(21, 21 + idlen);
  const cipher = body.subarray(21 + idlen);
  const uaPub = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(asPub);
  const prk = Buffer.from(crypto.hkdfSync("sha256", secret, auth, Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", prk, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", prk, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
  return JSON.parse(plain.subarray(0, plain.lastIndexOf(2)).toString());
}
const server = https.createServer({ key: fs.readFileSync("/tmp/pushcert/key.pem"), cert: fs.readFileSync("/tmp/pushcert/cert.pem") }, (req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const name = req.url.split("/").pop();
    if (name === "gone") { res.writeHead(410); return res.end(); }
    if (name === "flaky" && ++hits.flaky === 1) { res.writeHead(500); return res.end(); }
    try { received.push({ name, headers: req.headers, ...decrypt(name, Buffer.concat(chunks)) }); } catch (e) { received.push({ name, error: String(e) }); }
    res.writeHead(201); res.end();
  });
}).listen(9443);

const cron = async (secret = CRON, method = "POST") => {
  const r = await fetch(base + "/api/cron/reminders", { method, headers: secret ? { Authorization: `Bearer ${secret}` } : {} });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const local = () => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).reduce((a, x) => (a[x.type] = x.value, a), {});
  return { date: `${f.year}-${f.month}-${f.day}`, time: `${f.hour}:${f.minute}` };
};
const plus = (mins) => { const d = new Date(Date.now() + mins * 60000); const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {}); return { date: `${f.year}-${f.month}-${f.day}`, time: `${f.hour}:${f.minute}` }; };

const ws = (await q("select default_workspace_id w from profiles where user_id=$1", [USER_ID])).rows[0].w;
const biz = (await q("select id from businesses where name='Akerra'")).rows[0].id;
await q("truncate tasks, events, goals, reminders, notification_log, push_subscriptions cascade");

// ------------ 1) seguridad del endpoint
console.log("sin cabecera:", (await cron(null)).status, "| secreto malo:", (await cron("x".repeat(30))).status, "| GET sin secreto:", (await cron(null, "GET")).status);

// ------------ 2) sin dispositivos no hace nada
console.log("sin dispositivos:", JSON.stringify((await cron()).body));

// ------------ 3) un dispositivo: tarea, evento, recordatorio suelto, resumen, atrasadas, revisión semanal
const ok = makeSub("ok");
await q("insert into push_subscriptions (workspace_id,user_id,endpoint,p256dh,auth,user_agent) values ($1,$2,$3,$4,$5,'iPhone')", [ws, USER_ID, ok.endpoint, ok.p256dh, ok.auth]);
const now = local();
const dow = (new Date(now.date + "T00:00:00Z").getUTCDay() + 6) % 7;
await q(`update profiles set quiet_hours_start='00:00', quiet_hours_end='00:00', task_lead_minutes=5, event_lead_minutes=30,
  daily_digest_enabled=true, daily_digest_time=$2, overdue_alert_enabled=true, overdue_alert_time=$2, weekly_review_enabled=true, weekly_review_dow=$3, weekly_review_time=$2 where user_id=$1`, [USER_ID, plus(-5).time, dow]);
const t2 = plus(2), ev = plus(10), od = await q("select ($1::date - 2)::text d", [now.date]);
await q("insert into tasks (workspace_id,user_id,title,due_date,due_time,business_id) values ($1,$2,'Llamar a la imprenta',$3,$4,$5)", [ws, USER_ID, t2.date, t2.time, biz]);
await q("insert into tasks (workspace_id,user_id,title,due_date) values ($1,$2,'Revisar cuentas (sin hora)',$3)", [ws, USER_ID, now.date]);
await q("insert into tasks (workspace_id,user_id,title,due_date) values ($1,$2,'Tarea atrasada',$3)", [ws, USER_ID, od.rows[0].d]);
await q("insert into events (workspace_id,user_id,title,start_date,end_date,start_time,end_time,location) values ($1,$2,'Reunión con Ana',$3,$3,$4,$5,'Taller')", [ws, USER_ID, ev.date, ev.time, plus(70).time]);
await q("insert into reminders (workspace_id,user_id,title,remind_at) values ($1,$2,'Pedir presupuesto',now() - interval '10 seconds')", [ws, USER_ID]);
await q("insert into goals (workspace_id,user_id,title,measure_type,target_value) values ($1,$2,'Ingresar 5.000 €','euros',500000)", [ws, USER_ID]);

const first = await cron();
console.log("1.ª ejecución:", JSON.stringify(first.body));
console.log("avisos recibidos (descifrados):");
for (const m of received) console.log("  -", m.error ?? `[${m.kind}] ${m.title} | ${m.body.replace(/\n/g, " / ")} | ${m.url}`);
console.log("  cabeceras: TTL", received[0]?.headers.ttl, "| urgencia", received[0]?.headers.urgency, "| VAPID", /vapid t=/.test(received[0]?.headers.authorization ?? "") ? "ok" : "falta");
const n1 = received.length;
const second = await cron();
console.log("2.ª ejecución (mismo minuto, no debe repetir):", JSON.stringify(second.body), "| nuevos:", received.length - n1);

// ------------ 4) suscripción caducada (410) se borra
const gone = makeSub("gone");
await q("insert into push_subscriptions (workspace_id,user_id,endpoint,p256dh,auth) values ($1,$2,$3,$4,$5)", [ws, USER_ID, gone.endpoint, gone.p256dh, gone.auth]);
await q("insert into reminders (workspace_id,user_id,title,remind_at) values ($1,$2,'Otro recordatorio',now() - interval '5 seconds')", [ws, USER_ID]);
const r3 = await cron();
console.log("con una suscripción caducada:", JSON.stringify(r3.body), "| quedan:", (await q("select count(*)::int c from push_subscriptions")).rows[0].c, "(esperado 1)");

// ------------ 5) fallo temporal: se libera y se reintenta, sin perder ni duplicar
await q("delete from push_subscriptions");
const flaky = makeSub("flaky");
await q("insert into push_subscriptions (workspace_id,user_id,endpoint,p256dh,auth) values ($1,$2,$3,$4,$5)", [ws, USER_ID, flaky.endpoint, flaky.p256dh, flaky.auth]);
await q("insert into reminders (workspace_id,user_id,title,remind_at) values ($1,$2,'Recordatorio con fallo',now() - interval '5 seconds')", [ws, USER_ID]);
const before = received.length;
const f1 = await cron(); const f2 = await cron(); const f3 = await cron();
console.log("fallo temporal → intento 1:", `enviados ${f1.body.sent}, fallidos ${f1.body.failed}`, "| intento 2:", `enviados ${f2.body.sent}`, "| intento 3:", `enviados ${f3.body.sent}`, "| recibidos:", received.length - before, "(esperado 1)");

// ------------ 6) horas de silencio
await q("insert into reminders (workspace_id,user_id,title,remind_at) values ($1,$2,'En silencio',now() - interval '5 seconds')", [ws, USER_ID]);
const s = now.time; const hh = Number(s.slice(0, 2));
await q("update profiles set quiet_hours_start=$2, quiet_hours_end=$3 where user_id=$1", [USER_ID, `${String((hh + 23) % 24).padStart(2, "0")}:00`, `${String((hh + 2) % 24).padStart(2, "0")}:00`]);
const b2 = received.length;
console.log("en horas de silencio:", JSON.stringify((await cron()).body), "| recibidos:", received.length - b2, "(esperado 0)");
await q("update profiles set quiet_hours_start='00:00', quiet_hours_end='00:00' where user_id=$1", [USER_ID]);
await cron();
console.log("al terminar el silencio llega lo pendiente:", received.slice(b2).map((m) => m.body).join(" | "));

// ------------ 7) pantallas de la app
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "es-ES" });
await ctx.addCookies([sessionCookie(USER_ID)]);
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
const task = (await q("select id from tasks where title='Llamar a la imprenta'")).rows[0].id;
await page.goto(`${base}/aviso/task/${task}`); await page.waitForSelector("h1"); await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/shots5/1-aviso-tarea.png" });
await page.getByRole("button", { name: "Mañana", exact: true }).click(); await page.waitForTimeout(1500);
console.log("posponer desde el aviso →", (await q("select due_date::text d, due_time::text t from tasks where id=$1", [task])).rows[0]);
await page.goto(base + "/tareas"); await page.waitForSelector("h1");
await page.getByLabel("Nueva tarea", { exact: true }).fill("recuérdame el viernes a las 9 pedir presupuesto a la imprenta");
await page.waitForTimeout(300); await page.screenshot({ path: "/tmp/shots5/2-recuerdame.png" });
await page.keyboard.press("Enter"); await page.waitForTimeout(1500);
console.log("recordatorio creado por texto:", (await q("select title, remind_at at time zone 'Europe/Madrid' as local from reminders where title like 'Pedir presupuesto a%'")).rows);
await page.reload(); await page.waitForTimeout(800); await page.screenshot({ path: "/tmp/shots5/3-tareas-recordatorios.png" });
await page.goto(base + "/ajustes"); await page.waitForSelector("h1"); await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/shots5/4-ajustes-avisos.png", fullPage: true });
console.log("errores de página:", JSON.stringify(errors));
await browser.close(); server.close(); await db.end();

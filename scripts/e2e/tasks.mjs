// Tareas como Antola: filtros, alta rápida, «+» con formulario completo, Bandeja, completar con «Deshacer»,
// repetitivas (siguiente ocurrencia y puesta al día), detalle con acciones rápidas, subtareas y eliminar.
// Uso: USER_ID=<uuid> node scripts/e2e/tasks.mjs  (con scripts/e2e/up.sh levantado)
import pg from "pg";
import { chromium } from "playwright-core";
import { sessionCookie } from "./session.mjs";

const base = "http://localhost:3100";
const USER_ID = process.env.USER_ID;
const db = new pg.Client({ connectionString: "postgres://postgres:postgres@localhost:5432/biburu_test" });
await db.connect();
const q = (sql, p = []) => db.query(sql, p);
const ok = (cond, msg) => { if (!cond) { console.error("FALLO:", msg); process.exit(1); } console.log("OK", msg); };

const ws = (await q("select default_workspace_id id from profiles where user_id=$1", [USER_ID])).rows[0].id;
await q("delete from tasks where workspace_id=$1", [ws]);
await q("delete from businesses where workspace_id=$1 and name='Akerra E2E'", [ws]);
const biz = (await q("insert into businesses (workspace_id,user_id,name,color,icon) values ($1,$2,'Akerra E2E','#0ea5e9','shirt') returning id", [ws, USER_ID])).rows[0].id;
const today = (await q("select (now() at time zone 'Europe/Madrid')::date::text d")).rows[0].d;
const task = async (title) => (await q("select * from tasks where workspace_id=$1 and title=$2 order by created_at desc", [ws, title])).rows;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES" });
await ctx.addCookies([sessionCookie(USER_ID)]);
const page = await ctx.newPage();
const toast = (t) => page.locator("[popover]").getByText(t).first().waitFor({ timeout: 8000 });

// Vacío
await page.goto(`${base}/tareas`, { waitUntil: "networkidle" });
ok(await page.getByText("Nada pendiente para hoy").isVisible(), "Hoy vacío: «Nada pendiente para hoy»");
ok(await page.getByText("Disfruta del día o adelanta algo de la semana.").isVisible(), "con su texto");

// Alta rápida (se mantiene)
await page.getByRole("textbox", { name: "Nueva tarea" }).fill("Llamar a la imprenta mañana a las 10 !!");
await page.keyboard.press("Enter");
await toast("Tarea añadida");
const [quick] = await task("Llamar a la imprenta");
ok(quick && quick.priority === 3 && quick.due_time === "10:00:00" && quick.reminder_mode === "before" && quick.remind_at, "alta rápida: mañana 10:00, alta, aviso a su hora");

// «+» → formulario completo
await page.getByRole("link", { name: "Nueva tarea" }).click();
await page.waitForURL(/\/tareas\/nueva/);
ok(await page.getByPlaceholder("¿Qué hay que hacer?").evaluate((el) => el === document.activeElement), "título con el foco");
ok(await page.getByLabel("Hora (opcional)").isDisabled(), "hora desactivada sin fecha");
await page.getByPlaceholder("¿Qué hay que hacer?").fill("Revisar stock");
await page.getByRole("radio", { name: "Antes" }).click();
await page.getByRole("button", { name: "Crear tarea" }).click();
ok(await page.getByText("Para avisar antes, la tarea necesita una fecha.").isVisible(), "validación: avisar antes sin fecha");
await page.getByRole("button", { name: "Hoy", exact: true }).click();
await page.getByLabel("Hora (opcional)").fill("18:30");
await page.getByRole("radio", { name: "🔴 Alta" }).click();
await page.locator("select").filter({ has: page.locator('option[value="weekdays"]') }).selectOption("weekdays");
await page.getByRole("button", { name: "lunes" }).click();
await page.getByRole("button", { name: "miércoles" }).click();
ok(await page.getByText("Al marcarla aparece la siguiente.").isVisible(), "texto explicativo de la repetición");
await page.getByLabel("Cuánto antes").selectOption("15");
await page.getByLabel("Nueva subtarea").fill("Contar camisetas");
await page.keyboard.press("Enter");
await page.getByLabel("Nueva subtarea").fill("Contar DTF");
await page.getByRole("button", { name: "Crear tarea" }).click();
await toast("Tarea creada");
await page.waitForURL(/\/tareas$/);
const [rev] = await task("Revisar stock");
ok(rev.repeat === "weekdays" && JSON.stringify(rev.repeat_days) === "[1,3]" && rev.priority === 3 && rev.series_id === rev.id, "repetición L y X, prioridad alta, serie");
ok(rev.reminder_minutes_before === 15 && rev.due_at, "aviso 15 min antes con hora UTC");
ok((await q("select count(*)::int n from subtasks where task_id=$1", [rev.id])).rows[0].n === 2, "2 subtareas (también la que quedó escrita)");
ok(await page.getByRole("link", { name: /Revisar stock/ }).isVisible(), "sale en Hoy");
ok(await page.getByRole("link", { name: /Revisar stock/ }).getByText("0/2").isVisible(), "con subtareas 0/2");

// Bandeja
await page.goto(`${base}/tareas/nueva`, { waitUntil: "networkidle" });
await page.getByPlaceholder("¿Qué hay que hacer?").fill("Idea para la web");
await page.getByRole("button", { name: "Crear tarea" }).click();
await toast("Guardada en la Bandeja");
await page.goto(`${base}/tareas?f=bandeja`, { waitUntil: "networkidle" });
ok(await page.getByRole("link", { name: /Bandeja\s*1/ }).isVisible(), "chip Bandeja con contador 1");
ok(await page.getByText("Idea para la web").isVisible(), "la tarea está en la Bandeja");

// Completar con «Deshacer» y siguiente ocurrencia
await page.goto(`${base}/tareas`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Completar «Revisar stock»/ }).click();
await toast("¡Hecho! ✓");
await page.waitForTimeout(800);
const spawned = (await q("select id, due_date::text d, due_time::text t from tasks where spawned_from_id=$1", [rev.id])).rows;
ok(spawned.length === 1 && spawned[0].t === "18:30:00" && spawned[0].d > today, `siguiente ocurrencia creada (${spawned[0]?.d})`);
ok((await q("select count(*)::int n from subtasks where task_id=$1", [spawned[0].id])).rows[0].n === 2, "con sus subtareas");
await page.locator("[popover]").getByRole("button", { name: "Deshacer" }).click();
await page.waitForTimeout(1200);
ok((await q("select status from tasks where id=$1", [rev.id])).rows[0].status === "open", "Deshacer: vuelve a pendiente");
ok((await q("select count(*)::int n from tasks where spawned_from_id=$1", [rev.id])).rows[0].n === 0, "y borra la ocurrencia creada");

// Repetitiva atrasada → se pone al día; normal atrasada → «Vencidas»
await q("insert into tasks (workspace_id,user_id,title,due_date,repeat) values ($1,$2,'Regar las plantas',$3::date - 3,'daily')", [ws, USER_ID, today]);
await q("insert into tasks (workspace_id,user_id,title,due_date,business_id) values ($1,$2,'Enviar facturas',$3::date - 2,$4)", [ws, USER_ID, today, biz]);
await page.goto(`${base}/tareas`, { waitUntil: "networkidle" });
ok((await q("select due_date::text d from tasks where title='Regar las plantas'")).rows[0].d === today, "repetitiva atrasada pasa a hoy");
ok(await page.getByRole("region", { name: "Vencidas" }).getByText("Enviar facturas").isVisible(), "la normal sale en «Vencidas»");
ok(await page.getByRole("region", { name: "Vencidas" }).getByText("Hace 2 días").isVisible(), "con fecha relativa");

// Chips de proyecto (negocios)
await page.getByRole("navigation", { name: "Filtros" }).getByRole("link", { name: "Akerra E2E" }).click();
await page.waitForURL(new RegExp(`f=${biz}`));
ok(await page.getByText("Enviar facturas").isVisible(), "chip del negocio filtra sus tareas");
await page.goto(`${base}/tareas?f=00000000-0000-4000-8000-000000000000`, { waitUntil: "networkidle" });
ok(page.url().endsWith("/tareas"), "proyecto ajeno → /tareas");

// 7 días agrupado por día
await page.goto(`${base}/tareas?f=semana`, { waitUntil: "networkidle" });
ok(await page.getByRole("region", { name: "Mañana" }).getByText("Llamar a la imprenta").isVisible(), "Próximos 7 días agrupado (Mañana)");

// Detalle: acciones rápidas, subtareas y eliminar
await page.goto(`${base}/tareas/${quick.id}`, { waitUntil: "networkidle" });
ok(await page.getByRole("heading", { name: "Llamar a la imprenta" }).isVisible(), "detalle /tareas/:id");
const before = Date.now();
await page.getByRole("button", { name: "Posponer 15 min" }).click();
await toast("Te aviso dentro de 15 min");
const r1 = (await q("select remind_at from tasks where id=$1", [quick.id])).rows[0].remind_at;
ok(Math.abs(r1.getTime() - before - 15 * 60_000) < 60_000, "Posponer 15 min mueve el aviso");
await page.getByRole("button", { name: "Mañana" }).first().click();
await toast("Pasada a mañana");
ok((await q("select (due_date - $2::date)::int n from tasks where id=$1", [quick.id, today])).rows[0].n === 1, "«Mañana» la deja para mañana (ya lo era)");
await page.getByLabel("Nueva subtarea").fill("Pedir presupuesto");
await page.keyboard.press("Enter");
await page.waitForTimeout(1000);
await page.getByRole("button", { name: "Marcar Pedir presupuesto" }).click();
await page.waitForTimeout(1000);
ok((await q("select done from subtasks where task_id=$1", [quick.id])).rows[0]?.done === true, "subtarea añadida y marcada");
await page.getByRole("button", { name: "Hecho", exact: true }).click();
await toast("¡Hecho! ✓");
await page.waitForTimeout(800);
ok(await page.getByRole("button", { name: "Marcar pendiente" }).isVisible(), "Hecho → «Marcar pendiente»");
await page.getByRole("button", { name: "Eliminar" }).click();
ok(await page.getByRole("button", { name: "Toca otra vez para eliminar" }).isVisible(), "eliminar pide un segundo toque");
await page.getByRole("button", { name: "Toca otra vez para eliminar" }).click();
await page.waitForURL(/\/tareas$/);
ok((await task("Llamar a la imprenta")).length === 0, "eliminada");

// Editar con el mismo formulario
await page.goto(`${base}/tareas/${rev.id}`, { waitUntil: "networkidle" });
await page.getByRole("radio", { name: "⚪ Baja" }).click();
await page.getByRole("button", { name: "Guardar cambios" }).click();
await toast("Cambios guardados");
ok((await q("select priority from tasks where id=$1", [rev.id])).rows[0].priority === 1, "editar: prioridad baja guardada");

// Completadas
await q("update tasks set status='done', completed_at=now() where workspace_id=$1 and title='Idea para la web'", [ws]);
await page.goto(`${base}/tareas?f=hechas`, { waitUntil: "networkidle" });
ok(await page.getByRole("region", { name: "Completadas" }).getByText("Idea para la web").isVisible(), "filtro Completadas");

// Aviso antiguo → detalle nuevo
await page.goto(`${base}/aviso/task/${rev.id}`, { waitUntil: "networkidle" });
ok(page.url().endsWith(`/tareas/${rev.id}`), "/aviso/task/:id redirige al detalle");

await page.goto(`${base}/tareas`, { waitUntil: "networkidle" });
await page.screenshot({ path: process.env.SHOT ?? "/tmp/tareas.png", fullPage: true });
await browser.close();
await db.end();
console.log("Todo bien ✔");

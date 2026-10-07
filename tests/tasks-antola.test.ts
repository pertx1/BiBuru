import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

/**
 * Tareas como Antola: lo que haría la app desde la sesión de otro usuario (leer, editar, completar, posponer,
 * reprogramar, subtareas) no toca nada (0 filas = la acción responde «No se encontró la tarea»), y las reglas
 * de integridad de series, claves externas y avisos.
 */
d("Tareas (Antola): permisos de otro usuario e integridad", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", aWs: "", bWs: "", task: "", sub: "" };
  async function as<T>(uid: string, fn: (c: Client) => Promise<T>) {
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      return await fn(db);
    } finally { await db.query("rollback"); }
  }
  const q = (sql: string, p: unknown[] = []) => db.query(sql, p);

  beforeAll(async () => {
    await db.connect();
    await q("truncate auth.users cascade");
    ids.alice = (await q("insert into auth.users (email) values ('a@x.com') returning id")).rows[0].id;
    ids.bob = (await q("insert into auth.users (email) values ('b@x.com') returning id")).rows[0].id;
    ids.aWs = (await q("select id from workspaces where owner_id=$1", [ids.alice])).rows[0].id;
    ids.bWs = (await q("select id from workspaces where owner_id=$1", [ids.bob])).rows[0].id;
    ids.task = (await q(`insert into tasks (workspace_id,user_id,title,due_date,due_time,due_at,repeat,reminder_mode,reminder_minutes_before,remind_at)
      values ($1,$2,'Llamar a la imprenta','2026-10-08','10:00','2026-10-08T08:00Z','daily','before',15,'2026-10-08T07:45Z') returning id`, [ids.aWs, ids.alice])).rows[0].id;
    ids.sub = (await q("insert into subtasks (workspace_id,user_id,task_id,title) values ($1,$2,$3,'Pedir presupuesto') returning id", [ids.aWs, ids.alice, ids.task])).rows[0].id;
  });
  afterAll(async () => { await db.end(); });

  it("otro usuario no ve la tarea ni sus subtareas", async () => {
    expect((await as(ids.bob, (c) => c.query("select id from tasks where id=$1", [ids.task]))).rowCount).toBe(0);
    expect((await as(ids.bob, (c) => c.query("select id from subtasks where task_id=$1", [ids.task]))).rowCount).toBe(0);
    expect((await as(ids.alice, (c) => c.query("select id from subtasks where task_id=$1", [ids.task]))).rowCount).toBe(1);
  });

  it("otro usuario no puede editar, completar, posponer, reprogramar ni borrar", async () => {
    const tries = [
      "update tasks set title='x' where id=$1",                                          // editar
      "update tasks set status='done', completed_at=now() where id=$1 and status='open'", // completar
      "update tasks set remind_at=now() + interval '15 minutes' where id=$1",            // posponer
      "update tasks set due_date='2026-10-09' where id = any(array[$1]::uuid[])",        // reprogramar
      "delete from tasks where id=$1",
    ];
    for (const sql of tries) expect((await as(ids.bob, (c) => c.query(sql, [ids.task]))).rowCount, sql).toBe(0);
    const t = (await q("select title, status, remind_at, due_date::text from tasks where id=$1", [ids.task])).rows[0];
    expect(t).toMatchObject({ title: "Llamar a la imprenta", status: "open", due_date: "2026-10-08" });
  });

  it("otro usuario no puede tocar ni colgar subtareas de una tarea ajena", async () => {
    expect((await as(ids.bob, (c) => c.query("update subtasks set done=true where id=$1", [ids.sub]))).rowCount).toBe(0);
    expect((await as(ids.bob, (c) => c.query("delete from subtasks where id=$1", [ids.sub]))).rowCount).toBe(0);
    // En su espacio: la FK (task_id, workspace_id) lo impide; en el de Alice: RLS.
    await expect(as(ids.bob, (c) => c.query("insert into subtasks (workspace_id,user_id,task_id,title) values ($1,$2,$3,'x')", [ids.bWs, ids.bob, ids.task]))).rejects.toThrow();
    await expect(as(ids.bob, (c) => c.query("insert into subtasks (workspace_id,user_id,task_id,title) values ($1,$2,$3,'x')", [ids.aWs, ids.bob, ids.task]))).rejects.toThrow();
  });

  it("borrar la tarea borra sus subtareas", async () => {
    const t = (await q("insert into tasks (workspace_id,user_id,title) values ($1,$2,'temporal') returning id", [ids.aWs, ids.alice])).rows[0].id;
    await q("insert into subtasks (workspace_id,user_id,task_id,title) values ($1,$2,$3,'s')", [ids.aWs, ids.alice, t]);
    await q("delete from tasks where id=$1", [t]);
    expect((await q("select count(*)::int n from subtasks where task_id=$1", [t])).rows[0].n).toBe(0);
  });

  it("una tarea solo genera una siguiente ocurrencia (spawned_from_id único)", async () => {
    const ins = "insert into tasks (workspace_id,user_id,title,repeat,due_date,series_id,spawned_from_id) values ($1,$2,'siguiente','daily','2026-10-09',$3,$3)";
    await q(ins, [ids.aWs, ids.alice, ids.task]);
    await expect(q(ins, [ids.aWs, ids.alice, ids.task])).rejects.toThrow(/unique|duplicate/);
    // Y no puede apuntar a una tarea de otro espacio.
    const other = (await q("insert into tasks (workspace_id,user_id,title) values ($1,$2,'origen') returning id", [ids.aWs, ids.alice])).rows[0].id;
    await expect(q("insert into tasks (workspace_id,user_id,title,spawned_from_id) values ($1,$2,'x',$3)", [ids.bWs, ids.bob, other])).rejects.toThrow(/foreign key/);
  });

  it("clave externa «origen:clave» única por espacio", async () => {
    await q("insert into tasks (workspace_id,user_id,title,external_key) values ($1,$2,'Pedir camisetas','stock:x:item|1')", [ids.aWs, ids.alice]);
    await expect(q("insert into tasks (workspace_id,user_id,title,external_key) values ($1,$2,'otra','stock:x:item|1')", [ids.aWs, ids.alice])).rejects.toThrow(/unique|duplicate/);
    await expect(q("insert into tasks (workspace_id,user_id,title,external_key) values ($1,$2,'de Bob','stock:x:item|1')", [ids.bWs, ids.bob])).resolves.toBeDefined();
  });

  it("valores permitidos: prioridad 1–3 (media por defecto), repetición, días 0–6 y antelaciones de Antola", async () => {
    expect((await q("insert into tasks (workspace_id,user_id,title) values ($1,$2,'p') returning priority, repeat, reminder_mode", [ids.aWs, ids.alice])).rows[0])
      .toEqual({ priority: 2, repeat: "none", reminder_mode: "none" });
    const bad = [
      "insert into tasks (workspace_id,user_id,title,priority) values ($1,$2,'x',0)",
      "insert into tasks (workspace_id,user_id,title,repeat) values ($1,$2,'x','yearly')",
      "insert into tasks (workspace_id,user_id,title,repeat,repeat_days) values ($1,$2,'x','weekdays','{7}')",
      "insert into tasks (workspace_id,user_id,title,reminder_mode) values ($1,$2,'x','luego')",
      "insert into tasks (workspace_id,user_id,title,reminder_minutes_before) values ($1,$2,'x',7)",
    ];
    for (const sql of bad) await expect(q(sql, [ids.aWs, ids.alice]), sql).rejects.toThrow(/check/);
  });

  it("el perfil trae los avisos de tareas activados", async () => {
    expect((await q("select task_reminders_enabled from profiles where user_id=$1", [ids.alice])).rows[0].task_reminders_enabled).toBe(true);
  });
});

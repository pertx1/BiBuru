import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

d("Tareas, eventos y objetivos: permisos e integridad", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", aWs: "", bWs: "", aBiz: "", bBiz: "", aGoal: "", bGoal: "" };

  async function as<T>(uid: string, fn: (c: Client) => Promise<T>) {
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      return await fn(db);
    } finally {
      await db.query("rollback");
    }
  }
  const q = (sql: string, p: unknown[] = []) => db.query(sql, p);

  beforeAll(async () => {
    await db.connect();
    await q("truncate auth.users cascade");
    ids.alice = (await q("insert into auth.users (email) values ('a@x.com') returning id")).rows[0].id;
    ids.bob = (await q("insert into auth.users (email) values ('b@x.com') returning id")).rows[0].id;
    ids.aWs = (await q("select id from workspaces where owner_id=$1", [ids.alice])).rows[0].id;
    ids.bWs = (await q("select id from workspaces where owner_id=$1", [ids.bob])).rows[0].id;
    ids.aBiz = (await q("insert into businesses (workspace_id,user_id,name) values ($1,$2,'A') returning id", [ids.aWs, ids.alice])).rows[0].id;
    ids.bBiz = (await q("insert into businesses (workspace_id,user_id,name) values ($1,$2,'B') returning id", [ids.bWs, ids.bob])).rows[0].id;
    ids.aGoal = (await q("insert into goals (workspace_id,user_id,title) values ($1,$2,'G') returning id", [ids.aWs, ids.alice])).rows[0].id;
    ids.bGoal = (await q("insert into goals (workspace_id,user_id,title) values ($1,$2,'G') returning id", [ids.bWs, ids.bob])).rows[0].id;
    for (const [ws, u] of [[ids.aWs, ids.alice], [ids.bWs, ids.bob]]) {
      await q("insert into tasks (workspace_id,user_id,title,due_date) values ($1,$2,'t','2026-10-05')", [ws, u]);
      await q("insert into events (workspace_id,user_id,title,start_date,end_date,all_day) values ($1,$2,'e','2026-10-05','2026-10-05',true)", [ws, u]);
      await q("insert into goal_progress (workspace_id,user_id,goal_id,value) select $1,$2,id,5 from goals where workspace_id=$1", [ws, u]);
      await q("insert into goal_milestones (workspace_id,user_id,goal_id,title) select $1,$2,id,'m' from goals where workspace_id=$1", [ws, u]);
    }
  });
  afterAll(async () => { await db.end(); });

  it.each(["tasks", "events", "goals", "goal_progress", "goal_milestones"])("%s: cada usuario solo ve lo suyo", async (t) => {
    const r = await as(ids.alice, (c) => c.query(`select workspace_id from ${t}`));
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.every((x) => x.workspace_id === ids.aWs)).toBe(true);
  });

  it("no se puede modificar ni borrar lo de otro", async () => {
    const u = await as(ids.alice, (c) => c.query("update tasks set title='x' where workspace_id=$1", [ids.bWs]));
    expect(u.rowCount).toBe(0);
    const del = await as(ids.alice, (c) => c.query("delete from events where workspace_id=$1", [ids.bWs]));
    expect(del.rowCount).toBe(0);
  });

  it("no se puede enlazar una tarea con un negocio u objetivo de otro workspace", async () => {
    await expect(q("insert into tasks (workspace_id,user_id,title,business_id) values ($1,$2,'x',$3)", [ids.aWs, ids.alice, ids.bBiz])).rejects.toThrow(/foreign key/);
    await expect(q("insert into tasks (workspace_id,user_id,title,goal_id) values ($1,$2,'x',$3)", [ids.aWs, ids.alice, ids.bGoal])).rejects.toThrow(/foreign key/);
  });

  it("las subtareas tienen un solo nivel", async () => {
    const parent = (await q("insert into tasks (workspace_id,user_id,title) values ($1,$2,'padre') returning id", [ids.aWs, ids.alice])).rows[0].id;
    const child = (await q("insert into tasks (workspace_id,user_id,title,parent_id) values ($1,$2,'hija',$3) returning id", [ids.aWs, ids.alice, parent])).rows[0].id;
    await expect(q("insert into tasks (workspace_id,user_id,title,parent_id) values ($1,$2,'nieta',$3)", [ids.aWs, ids.alice, child])).rejects.toThrow(/un nivel/);
    await expect(q("update tasks set parent_id=$1 where id=$2", [child, parent])).rejects.toThrow(/subtareas|un nivel/);
    await expect(q("update tasks set parent_id=id where id=$1", [parent])).rejects.toThrow(/sí misma/);
  });

  it("borrar la tarea padre borra sus subtareas", async () => {
    const parent = (await q("insert into tasks (workspace_id,user_id,title) values ($1,$2,'p2') returning id", [ids.aWs, ids.alice])).rows[0].id;
    await q("insert into tasks (workspace_id,user_id,title,parent_id) values ($1,$2,'h2',$3)", [ids.aWs, ids.alice, parent]);
    await q("delete from tasks where id=$1", [parent]);
    expect((await q("select count(*)::int n from tasks where parent_id=$1", [parent])).rows[0].n).toBe(0);
  });

  it("borrar un negocio conserva sus tareas y eventos (se desvinculan)", async () => {
    const biz = (await q("insert into businesses (workspace_id,user_id,name) values ($1,$2,'Temp') returning id", [ids.aWs, ids.alice])).rows[0].id;
    const t = (await q("insert into tasks (workspace_id,user_id,title,business_id) values ($1,$2,'con negocio',$3) returning id", [ids.aWs, ids.alice, biz])).rows[0].id;
    await q("delete from businesses where id=$1", [biz]);
    const r = await q("select business_id, workspace_id from tasks where id=$1", [t]);
    expect(r.rows[0].business_id).toBeNull();
    expect(r.rows[0].workspace_id).toBe(ids.aWs); // set null (business_id) no toca workspace_id
  });

  it("restricciones de datos", async () => {
    await expect(q("insert into tasks (workspace_id,user_id,title,due_time) values ($1,$2,'x','10:00')", [ids.aWs, ids.alice])).rejects.toThrow(/check/); // hora sin fecha
    await expect(q("insert into tasks (workspace_id,user_id,title,priority) values ($1,$2,'x',9)", [ids.aWs, ids.alice])).rejects.toThrow(/check/);
    await expect(q(`insert into tasks (workspace_id,user_id,title,recurrence) values ($1,$2,'x','{"freq":"raro"}')`, [ids.aWs, ids.alice])).rejects.toThrow(/check/);
    await expect(q("insert into events (workspace_id,user_id,title,start_date,end_date) values ($1,$2,'x','2026-10-05','2026-10-05')", [ids.aWs, ids.alice])).rejects.toThrow(/check/); // con hora faltante
    await expect(q("insert into events (workspace_id,user_id,title,start_date,end_date,start_time,end_time) values ($1,$2,'x','2026-10-05','2026-10-05','10:00','09:00')", [ids.aWs, ids.alice])).rejects.toThrow(/check/);
    await expect(q("insert into events (workspace_id,user_id,title,start_date,end_date,all_day) values ($1,$2,'x','2026-10-06','2026-10-05',true)", [ids.aWs, ids.alice])).rejects.toThrow(/check/);
  });

  it("un evento puede cruzar la medianoche", async () => {
    await expect(q("insert into events (workspace_id,user_id,title,start_date,end_date,start_time,end_time) values ($1,$2,'noche','2026-10-05','2026-10-06','22:00','02:00')", [ids.aWs, ids.alice])).resolves.toBeDefined();
  });

  it("un objetivo guarda solo un avance por día", async () => {
    await expect(q("insert into goal_progress (workspace_id,user_id,goal_id,value,recorded_on) values ($1,$2,$3,9,current_date)", [ids.aWs, ids.alice, ids.aGoal])).rejects.toThrow(/duplicate|unique/);
  });

  it("el perfil tiene día de revisión semanal por defecto (lunes)", async () => {
    const r = await q("select weekly_review_dow from profiles where user_id=$1", [ids.alice]);
    expect(r.rows[0].weekly_review_dow).toBe(0);
  });
});

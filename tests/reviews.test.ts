import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

d("Revisiones: una por periodo, por persona y espacio", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", ws: "", bWs: "", review: "" };
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
    ids.ws = (await q("select id from workspaces where owner_id=$1", [ids.alice])).rows[0].id;
    ids.bWs = (await q("select id from workspaces where owner_id=$1", [ids.bob])).rows[0].id;
    ids.review = (await q("insert into reviews (workspace_id,user_id,kind,period_start,period_end,data) values ($1,$2,'semanal','2026-10-05','2026-10-11','{\"v\":1}') returning id", [ids.ws, ids.alice])).rows[0].id;
  });
  afterAll(async () => { await db.end(); });

  it("la dueña la ve, la cierra y guarda prioridades; otro espacio no la ve", async () => {
    expect((await as(ids.alice, (c) => c.query("select id from reviews"))).rows).toHaveLength(1);
    expect((await as(ids.alice, (c) => c.query("update reviews set reviewed_at=now(), priorities='{a,b,c}' where id=$1", [ids.review]))).rowCount).toBe(1);
    expect((await as(ids.bob, (c) => c.query("select id from reviews"))).rows).toHaveLength(0);
    expect((await as(ids.bob, (c) => c.query("update reviews set reviewed_at=now() where id=$1", [ids.review]))).rowCount).toBe(0);
    await expect(as(ids.bob, (c) => c.query("insert into reviews (workspace_id,user_id,kind,period_start,period_end) values ($1,$2,'diaria','2026-10-07','2026-10-07')", [ids.ws, ids.bob]))).rejects.toThrow();
  });
  it("una sola por tipo y periodo; valores controlados", async () => {
    await expect(q("insert into reviews (workspace_id,user_id,kind,period_start,period_end) values ($1,$2,'semanal','2026-10-05','2026-10-11')", [ids.ws, ids.alice])).rejects.toThrow();
    await expect(q("insert into reviews (workspace_id,user_id,kind,period_start,period_end) values ($1,$2,'anual','2026-01-01','2026-12-31')", [ids.ws, ids.alice])).rejects.toThrow();
    await expect(q("insert into reviews (workspace_id,user_id,kind,period_start,period_end) values ($1,$2,'diaria','2026-10-07','2026-10-06')", [ids.ws, ids.alice])).rejects.toThrow();
    await expect(q("update reviews set priorities='{a,b,c,d}' where id=$1", [ids.review])).rejects.toThrow();
    await expect(q("update reviews set data='[]' where id=$1", [ids.review])).rejects.toThrow();
  });
  it("ajustes con valores por defecto (semanal: domingo por la tarde) y el párrafo de IA cuenta en el presupuesto", async () => {
    const p = (await q("select review_daily_enabled, review_daily_time, review_weekly_dow, review_weekly_time, review_monthly_time from profiles where user_id=$1", [ids.alice])).rows[0];
    expect(p).toEqual({ review_daily_enabled: true, review_daily_time: "08:30:00", review_weekly_dow: 6, review_weekly_time: "18:00:00", review_monthly_time: "09:00:00" });
    await expect(q("update profiles set review_weekly_dow=7 where user_id=$1", [ids.alice])).rejects.toThrow();
    expect((await q("insert into ai_usage (workspace_id,user_id,feature,model) values ($1,$2,'review','x') returning id", [ids.ws, ids.alice])).rowCount).toBe(1);
  });
});

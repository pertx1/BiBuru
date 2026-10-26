import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

/** Clave del widget de iPhone: personal, una por espacio, nadie más la ve ni la toca. */
d("widget_tokens", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", aWs: "", bWs: "" };
  const q = (sql: string, p: unknown[] = []) => db.query(sql, p);
  async function as<T>(uid: string, fn: (c: Client) => Promise<T>) {
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      return await fn(db);
    } finally { await db.query("rollback"); }
  }
  beforeAll(async () => {
    await db.connect();
    await q("truncate auth.users cascade");
    ids.alice = (await q("insert into auth.users (email) values ('a@x.com') returning id")).rows[0].id;
    ids.bob = (await q("insert into auth.users (email) values ('b@x.com') returning id")).rows[0].id;
    ids.aWs = (await q("select id from workspaces where owner_id=$1", [ids.alice])).rows[0].id;
    ids.bWs = (await q("select id from workspaces where owner_id=$1", [ids.bob])).rows[0].id;
    await q("insert into widget_tokens (workspace_id,user_id,token_hash) values ($1,$2,$3),($4,$5,$6)", [ids.aWs, ids.alice, "a".repeat(64), ids.bWs, ids.bob, "b".repeat(64)]);
  });
  afterAll(async () => { await db.end(); });

  it("cada uno ve y borra solo la suya", async () => {
    expect((await as(ids.alice, (c) => c.query("select token_hash from widget_tokens"))).rows).toEqual([{ token_hash: "a".repeat(64) }]);
    expect((await as(ids.alice, (c) => c.query("delete from widget_tokens where user_id=$1", [ids.bob]))).rowCount).toBe(0);
  });
  it("no se crea en el espacio de otro, ni dos por espacio, ni con hash raro", async () => {
    await expect(as(ids.alice, (c) => c.query("insert into widget_tokens (workspace_id,user_id,token_hash) values ($1,$2,$3)", [ids.bWs, ids.alice, "c".repeat(64)]))).rejects.toThrow();
    await expect(as(ids.alice, (c) => c.query("insert into widget_tokens (workspace_id,user_id,token_hash) values ($1,$2,$3)", [ids.aWs, ids.alice, "d".repeat(64)]))).rejects.toThrow(/duplicate|unique/i);
    await expect(as(ids.alice, (c) => c.query("insert into widget_tokens (workspace_id,user_id,token_hash) values ($1,$2,'x')", [ids.aWs, ids.alice]))).rejects.toThrow();
  });
});

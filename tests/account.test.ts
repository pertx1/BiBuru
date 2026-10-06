import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

d("Borrado de cuenta", () => {
  const db = new Client({ connectionString: url });
  beforeAll(async () => { await db.connect(); });
  afterAll(async () => { await db.end(); });

  it("borrar el usuario elimina todos sus datos (y no toca los de otra persona)", async () => {
    await db.query("truncate auth.users cascade");
    const a = (await db.query("insert into auth.users (email) values ('a@x.com') returning id")).rows[0].id;
    const b = (await db.query("insert into auth.users (email) values ('b@x.com') returning id")).rows[0].id;
    const wsA = (await db.query("select id from workspaces where owner_id=$1", [a])).rows[0].id;
    const wsB = (await db.query("select id from workspaces where owner_id=$1", [b])).rows[0].id;
    for (const [ws, u] of [[wsA, a], [wsB, b]]) {
      const biz = (await db.query("insert into businesses (workspace_id,user_id,name) values ($1,$2,'N') returning id", [ws, u])).rows[0].id;
      await db.query("insert into tasks (workspace_id,user_id,title,business_id) values ($1,$2,'t',$3)", [ws, u, biz]);
      await db.query("insert into notes (workspace_id,user_id,title) values ($1,$2,'n')", [ws, u]);
      await db.query("insert into saved_videos (workspace_id,user_id,source,url) values ($1,$2,'other',$3)", [ws, u, `https://x.test/${u}`]);
      await db.query("insert into integrations (user_id,workspace_id,provider,refresh_token_enc) values ($1,$2,'google','v1.x.y.z')", [u, ws]);
      await db.query("insert into ai_usage (workspace_id,user_id,feature,model) values ($1,$2,'chat','m')", [ws, u]);
    }
    await db.query("delete from auth.users where id=$1", [a]);

    const tables = (await db.query("select distinct table_name from information_schema.columns where table_schema='public' and column_name='workspace_id'")).rows.map((r) => r.table_name as string);
    for (const t of tables) {
      const left = await db.query(`select count(*)::int n from public.${t} where workspace_id=$1`, [wsA]);
      expect(left.rows[0].n, t).toBe(0);
    }
    expect((await db.query("select count(*)::int n from public.workspaces where id=$1", [wsA])).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from public.profiles where user_id=$1", [a])).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from public.tasks where workspace_id=$1", [wsB])).rows[0].n).toBe(1);
    expect((await db.query("select count(*)::int n from public.integrations where user_id=$1", [b])).rows[0].n).toBe(1);
  });

  it("ensure_profile repara una cuenta sin perfil, solo la propia", async () => {
    await db.query("alter table auth.users disable trigger on_auth_user_created");
    const u = (await db.query("insert into auth.users (email) values ('sinperfil@x.com') returning id")).rows[0].id;
    await db.query("alter table auth.users enable trigger on_auth_user_created");
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [u]);
      const ws = (await db.query("select public.ensure_profile() as ws")).rows[0].ws;
      expect(ws).toBeTruthy();
      expect((await db.query("select display_name from profiles")).rows).toEqual([{ display_name: "sinperfil" }]);
      await expect(db.query("select public.ensure_profile_for($1)", [u])).rejects.toThrow(/permission denied/i);
    } finally {
      await db.query("rollback");
    }
  });
});

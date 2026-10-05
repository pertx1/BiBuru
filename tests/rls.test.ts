import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Estos tests necesitan una base de datos con las migraciones aplicadas.
// Se lanzan con `npm run test:db`; sin DATABASE_TEST_URL se omiten.
const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

d("RLS: un usuario no ve datos de otro", () => {
  const admin = new Client({ connectionString: url });
  let alice = "";
  let bob = "";
  let aliceWs = "";
  let bobWs = "";

  /** Ejecuta `fn` como usuario autenticado `uid` y deshace todo al acabar. */
  async function asUser<T>(uid: string | null, fn: (c: Client) => Promise<T>) {
    await admin.query("begin");
    try {
      await admin.query(uid ? "set local role authenticated" : "set local role anon");
      if (uid) await admin.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      return await fn(admin);
    } finally {
      await admin.query("rollback");
    }
  }

  beforeAll(async () => {
    await admin.connect();
    const a = await admin.query(
      "insert into auth.users (email) values ('alice@example.com') returning id",
    );
    const b = await admin.query(
      "insert into auth.users (email) values ('bob@example.com') returning id",
    );
    alice = a.rows[0].id;
    bob = b.rows[0].id;
    aliceWs = (await admin.query("select id from workspaces where owner_id=$1", [alice])).rows[0].id;
    bobWs = (await admin.query("select id from workspaces where owner_id=$1", [bob])).rows[0].id;
  });

  afterAll(async () => {
    await admin.end();
  });

  it("el alta de usuario crea workspace, membresía y perfil", async () => {
    const m = await admin.query(
      "select role from workspace_members where user_id=$1 and workspace_id=$2",
      [alice, aliceWs],
    );
    expect(m.rows[0].role).toBe("owner");
    const p = await admin.query("select timezone, ai_monthly_budget_cents from profiles where user_id=$1", [alice]);
    expect(p.rows[0]).toEqual({ timezone: "Europe/Madrid", ai_monthly_budget_cents: 1000 });
  });

  it("cada usuario solo ve su workspace", async () => {
    const rows = await asUser(alice, (c) => c.query("select id from workspaces"));
    expect(rows.rows.map((r) => r.id)).toEqual([aliceWs]);
  });

  it("cada usuario solo ve su perfil", async () => {
    const rows = await asUser(alice, (c) => c.query("select user_id from profiles"));
    expect(rows.rows.map((r) => r.user_id)).toEqual([alice]);
  });

  it("no se puede ver la membresía de otro workspace", async () => {
    const rows = await asUser(alice, (c) =>
      c.query("select * from workspace_members where workspace_id=$1", [bobWs]),
    );
    expect(rows.rowCount).toBe(0);
  });

  it("no se puede editar el workspace ni el perfil de otro", async () => {
    const ws = await asUser(alice, (c) =>
      c.query("update workspaces set name='hackeado' where id=$1", [bobWs]),
    );
    expect(ws.rowCount).toBe(0);
    const pr = await asUser(alice, (c) =>
      c.query("update profiles set display_name='hackeado' where user_id=$1", [bob]),
    );
    expect(pr.rowCount).toBe(0);
  });

  it("no te puedes añadir como miembro del workspace de otro", async () => {
    await expect(
      asUser(alice, (c) =>
        c.query("insert into workspace_members (workspace_id, user_id, role) values ($1,$2,'owner')", [bobWs, alice]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("sí se puede editar el propio perfil", async () => {
    const r = await asUser(alice, (c) =>
      c.query("update profiles set display_name='Alicia' where user_id=$1", [alice]),
    );
    expect(r.rowCount).toBe(1);
  });

  it("un usuario no puede crear workspaces ni perfiles por su cuenta", async () => {
    await expect(
      asUser(alice, (c) => c.query("insert into workspaces (owner_id, name) values ($1,'x')", [alice])),
    ).rejects.toThrow(/permission denied/);
  });

  it("anónimo no ve nada", async () => {
    await expect(asUser(null, (c) => c.query("select * from profiles"))).rejects.toThrow(/permission denied/);
  });
});

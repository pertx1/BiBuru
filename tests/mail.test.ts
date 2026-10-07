import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

d("Correo: cuentas personales, token ilegible y cabeceras solo del dueño", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", aWs: "", acc: "" };
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
    ids.acc = (await q("insert into mail_accounts (user_id,workspace_id,email,refresh_token_enc,delta_link) values ($1,$2,'a@outlook.es','cifrado','https://graph.microsoft.com/v1.0/x') returning id", [ids.alice, ids.aWs])).rows[0].id;
    await q("insert into mail_messages (user_id,workspace_id,account_id,graph_id,subject,received_at) values ($1,$2,$3,'g1','Pedido nuevo',now())", [ids.alice, ids.aWs, ids.acc]);
  });
  afterAll(async () => { await db.end(); });

  it("el token cifrado y el enlace de sincronización no se pueden leer desde la app", async () => {
    await expect(as(ids.alice, (c) => c.query("select refresh_token_enc from mail_accounts"))).rejects.toThrow();
    await expect(as(ids.alice, (c) => c.query("select delta_link from mail_accounts"))).rejects.toThrow();
    expect((await as(ids.alice, (c) => c.query("select email, notify_new from mail_accounts"))).rows).toEqual([{ email: "a@outlook.es", notify_new: false }]);
  });

  it("sin altas desde la app; solo se cambia negocio y aviso", async () => {
    await expect(as(ids.alice, (c) => c.query("insert into mail_accounts (user_id,workspace_id,email,refresh_token_enc) values ($1,$2,'x@x.es','x')", [ids.alice, ids.aWs]))).rejects.toThrow();
    await expect(as(ids.alice, (c) => c.query("update mail_accounts set refresh_token_enc='robado'"))).rejects.toThrow();
    expect((await as(ids.alice, (c) => c.query("update mail_accounts set notify_new=true"))).rowCount).toBe(1);
  });

  it("otra persona no ve ni toca cuentas ni correos ajenos; los correos no se escriben desde la app", async () => {
    expect((await as(ids.bob, (c) => c.query("select id from mail_accounts"))).rows).toHaveLength(0);
    expect((await as(ids.bob, (c) => c.query("select id from mail_messages"))).rows).toHaveLength(0);
    expect((await as(ids.bob, (c) => c.query("delete from mail_accounts"))).rowCount).toBe(0);
    expect((await as(ids.alice, (c) => c.query("select subject from mail_messages"))).rows).toEqual([{ subject: "Pedido nuevo" }]);
    await expect(as(ids.alice, (c) => c.query("update mail_messages set subject='x'"))).rejects.toThrow();
  });

  it("IA con correos apagada por defecto; desconectar borra los correos guardados", async () => {
    expect((await q("select mail_ai_allowed from profiles where user_id=$1", [ids.alice])).rows[0].mail_ai_allowed).toBe(false);
    await q("delete from mail_accounts where id=$1", [ids.acc]);
    expect((await q("select count(*)::int n from mail_messages")).rows[0].n).toBe(0);
  });
});

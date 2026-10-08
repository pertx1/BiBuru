import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

/** Mensajes del negocio: el correo se puede marcar «respondido»/«archivado» (solo tus correos y solo esa columna). */
d("Mensajes: estado del correo en BiBuru", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", ws: "", acc: "", msg: "" };
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
    await db.query("truncate auth.users cascade");
    ids.alice = (await db.query("insert into auth.users (email) values ('a@x.com') returning id")).rows[0].id;
    ids.bob = (await db.query("insert into auth.users (email) values ('b@x.com') returning id")).rows[0].id;
    ids.ws = (await db.query("select id from workspaces where owner_id=$1", [ids.alice])).rows[0].id;
    ids.acc = (await db.query("insert into mail_accounts (user_id,workspace_id,email,refresh_token_enc) values ($1,$2,'a@x.com','cifrado') returning id", [ids.alice, ids.ws])).rows[0].id;
    ids.msg = (await db.query("insert into mail_messages (user_id,workspace_id,account_id,graph_id,received_at) values ($1,$2,$3,'g1',now()) returning id", [ids.alice, ids.ws, ids.acc])).rows[0].id;
  });
  afterAll(async () => { await db.end(); });

  it("la dueña marca respondido o archivado; valores controlados", async () => {
    expect((await as(ids.alice, (c) => c.query("update mail_messages set triage='respondido' where id=$1", [ids.msg]))).rowCount).toBe(1);
    expect((await as(ids.alice, (c) => c.query("update mail_messages set triage=null where id=$1", [ids.msg]))).rowCount).toBe(1);
    await expect(as(ids.alice, (c) => c.query("update mail_messages set triage='leido' where id=$1", [ids.msg]))).rejects.toThrow();
  });
  it("no puede cambiar otras columnas ni los correos de otra persona", async () => {
    await expect(as(ids.alice, (c) => c.query("update mail_messages set subject='x' where id=$1", [ids.msg]))).rejects.toThrow();
    expect((await as(ids.bob, (c) => c.query("update mail_messages set triage='archivado' where id=$1", [ids.msg]))).rowCount).toBe(0);
  });
});

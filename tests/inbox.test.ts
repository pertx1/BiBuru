import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

d("Bandeja de redes: hilos, mensajes y respuestas guardadas por espacio", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", aWs: "", bWs: "", acc: "", bAcc: "", thread: "", biz: "", bBiz: "" };
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
    ids.biz = (await q("insert into businesses (workspace_id,user_id,name) values ($1,$2,'Akerra') returning id", [ids.aWs, ids.alice])).rows[0].id;
    ids.bBiz = (await q("insert into businesses (workspace_id,user_id,name) values ($1,$2,'Otro') returning id", [ids.bWs, ids.bob])).rows[0].id;
    ids.acc = (await q("insert into social_accounts (workspace_id,user_id,platform,external_id,username,access_token_enc) values ($1,$2,'instagram','178','akerra','cifrado') returning id", [ids.aWs, ids.alice])).rows[0].id;
    ids.bAcc = (await q("insert into social_accounts (workspace_id,user_id,platform,external_id,username,access_token_enc) values ($1,$2,'instagram','999','bob','cifrado') returning id", [ids.bWs, ids.bob])).rows[0].id;
    ids.thread = (await q("insert into social_threads (workspace_id,user_id,account_id,platform,kind,external_id,participant_name,preview) values ($1,$2,$3,'instagram','dm','dm:55','Ana','¿Tienes talla M?') returning id", [ids.aWs, ids.alice, ids.acc])).rows[0].id;
    await q("insert into social_messages (workspace_id,user_id,thread_id,external_id,direction,body) values ($1,$2,$3,'m1','in','¿Tienes talla M?')", [ids.aWs, ids.alice, ids.thread]);
  });
  afterAll(async () => { await db.end(); });

  it("cada espacio ve solo sus hilos, mensajes y respuestas guardadas", async () => {
    await q("insert into social_saved_replies (workspace_id,user_id,business_id,title,body) values ($1,$2,$3,'Tallas','Tenemos de la S a la XL')", [ids.aWs, ids.alice, ids.biz]);
    for (const t of ["social_threads", "social_messages", "social_saved_replies"]) {
      expect((await as(ids.alice, (c) => c.query(`select id from ${t}`))).rows.length, t).toBeGreaterThan(0);
      expect((await as(ids.bob, (c) => c.query(`select id from ${t}`))).rows, t).toHaveLength(0);
    }
    expect((await as(ids.bob, (c) => c.query("update social_threads set status='archivado'"))).rowCount).toBe(0);
  });

  it("el dueño puede marcar, etiquetar y escribir su respuesta", async () => {
    await as(ids.alice, async (c) => {
      expect((await c.query("update social_threads set status='respondido', labels='{cliente}', unread=false where id=$1", [ids.thread])).rowCount).toBe(1);
      expect((await c.query("insert into social_messages (workspace_id,user_id,thread_id,direction,body,send_status,send_mode) values ($1,$2,$3,'out','Sí','enviando','dm')", [ids.aWs, ids.alice, ids.thread])).rowCount).toBe(1);
    });
  });

  it("no se puede colar un hilo en una cuenta ajena ni un mensaje en un hilo ajeno", async () => {
    await expect(as(ids.bob, (c) => c.query("insert into social_threads (workspace_id,user_id,account_id,platform,kind,external_id) values ($1,$2,$3,'instagram','dm','x')", [ids.bWs, ids.bob, ids.acc]))).rejects.toThrow();
    await expect(as(ids.bob, (c) => c.query("insert into social_messages (workspace_id,user_id,thread_id,direction,body) values ($1,$2,$3,'in','hola')", [ids.bWs, ids.bob, ids.thread]))).rejects.toThrow();
    await expect(as(ids.bob, (c) => c.query("insert into social_threads (workspace_id,user_id,account_id,platform,kind,external_id) values ($1,$2,$3,'instagram','dm','x')", [ids.aWs, ids.bob, ids.acc]))).rejects.toThrow();
    // Respuesta guardada enlazada a un negocio de otro espacio.
    await expect(as(ids.bob, (c) => c.query("insert into social_saved_replies (workspace_id,user_id,business_id,title,body) values ($1,$2,$3,'x','y')", [ids.bWs, ids.bob, ids.biz]))).rejects.toThrow();
  });

  it("valores controlados: estado, tipo, envío, un mensaje externo una sola vez y máx. 10 etiquetas", async () => {
    await expect(q("update social_threads set status='leido' where id=$1", [ids.thread])).rejects.toThrow();
    await expect(q("insert into social_threads (workspace_id,user_id,account_id,platform,kind,external_id) values ($1,$2,$3,'instagram','story','y')", [ids.aWs, ids.alice, ids.acc])).rejects.toThrow();
    await expect(q("insert into social_threads (workspace_id,user_id,account_id,platform,kind,external_id) values ($1,$2,$3,'instagram','dm','dm:55')", [ids.aWs, ids.alice, ids.acc])).rejects.toThrow();
    await expect(q("insert into social_messages (workspace_id,user_id,thread_id,external_id,direction) values ($1,$2,$3,'m1','in')", [ids.aWs, ids.alice, ids.thread])).rejects.toThrow();
    await expect(q("insert into social_messages (workspace_id,user_id,thread_id,direction,send_status) values ($1,$2,$3,'out','perdido')", [ids.aWs, ids.alice, ids.thread])).rejects.toThrow();
    await expect(q("update social_threads set labels=$2 where id=$1", [ids.thread, Array.from({ length: 11 }, (_, i) => `e${i}`)])).rejects.toThrow();
    await expect(q("update social_threads set media_permalink='http://x.com' where id=$1", [ids.thread])).rejects.toThrow();
  });

  it("columnas de sincronización legibles y ajustes de la bandeja con valores por defecto", async () => {
    const r = await as(ids.alice, (c) => c.query("select followers_count, last_sync_at, sync_error, rate_limited_until, webhook_subscribed from social_accounts"));
    expect(r.rows).toEqual([{ followers_count: null, last_sync_at: null, sync_error: null, rate_limited_until: null, webhook_subscribed: false }]);
    const p = await as(ids.alice, (c) => c.query("select inbox_ai_suggest, inbox_push_enabled, social_alerts_enabled from profiles where user_id=$1", [ids.alice]));
    expect(p.rows[0]).toEqual({ inbox_ai_suggest: false, inbox_push_enabled: true, social_alerts_enabled: false });
    expect((await as(ids.alice, (c) => c.query("update profiles set inbox_ai_suggest=true where user_id=$1", [ids.alice]))).rowCount).toBe(1);
  });

  it("borrar la cuenta borra sus hilos y mensajes; borrar el pedido solo suelta el vínculo", async () => {
    const order = (await q("insert into orders (workspace_id,user_id,business_id) values ($1,$2,$3) returning id", [ids.aWs, ids.alice, ids.biz])).rows[0].id;
    await q("update social_threads set order_id=$2 where id=$1", [ids.thread, order]);
    await q("delete from orders where id=$1", [order]);
    expect((await q("select order_id from social_threads where id=$1", [ids.thread])).rows[0].order_id).toBeNull();
    await q("delete from social_accounts where id=$1", [ids.acc]);
    expect((await q("select count(*)::int n from social_threads where workspace_id=$1", [ids.aWs])).rows[0].n).toBe(0);
    expect((await q("select count(*)::int n from social_messages where workspace_id=$1", [ids.aWs])).rows[0].n).toBe(0);
  });
});

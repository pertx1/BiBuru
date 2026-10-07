import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

d("Redes: cuentas con token ilegible, estadísticas y programación por espacio", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", aWs: "", bWs: "", acc: "", post: "" };
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
    ids.acc = (await q("insert into social_accounts (workspace_id,user_id,platform,external_id,username,access_token_enc) values ($1,$2,'instagram','178','akerra','cifrado') returning id", [ids.aWs, ids.alice])).rows[0].id;
    await q("insert into social_daily (workspace_id,account_id,day,followers,reach) values ($1,$2,'2026-10-06',1200,300)", [ids.aWs, ids.acc]);
    ids.post = (await q("insert into social_posts (workspace_id,user_id,caption,scheduled_at,status) values ($1,$2,'Hola','2026-10-08T17:00:00Z','programada') returning id", [ids.aWs, ids.alice])).rows[0].id;
    await q("insert into social_post_targets (workspace_id,user_id,post_id,account_id) values ($1,$2,$3,$4)", [ids.aWs, ids.alice, ids.post, ids.acc]);
  });
  afterAll(async () => { await db.end(); });

  it("el token no se puede leer ni cambiar desde la app; sí el negocio", async () => {
    await expect(as(ids.alice, (c) => c.query("select access_token_enc from social_accounts"))).rejects.toThrow();
    await expect(as(ids.alice, (c) => c.query("update social_accounts set access_token_enc='x'"))).rejects.toThrow();
    await expect(as(ids.alice, (c) => c.query("insert into social_accounts (workspace_id,user_id,platform,external_id,access_token_enc) values ($1,$2,'instagram','1','x')", [ids.aWs, ids.alice]))).rejects.toThrow();
    expect((await as(ids.alice, (c) => c.query("select username, status from social_accounts"))).rows).toEqual([{ username: "akerra", status: "ok" }]);
  });

  it("otro espacio no ve cuentas, estadísticas ni publicaciones", async () => {
    for (const t of ["social_accounts", "social_daily", "social_posts", "social_post_targets"]) {
      expect((await as(ids.bob, (c) => c.query(`select id from ${t}`))).rows, t).toHaveLength(0);
    }
    // No puede programar en una cuenta ajena.
    const bobPost = (await q("insert into social_posts (workspace_id,user_id) values ($1,$2) returning id", [ids.bWs, ids.bob])).rows[0].id;
    await expect(q("insert into social_post_targets (workspace_id,user_id,post_id,account_id) values ($1,$2,$3,$4)", [ids.bWs, ids.bob, bobPost, ids.acc])).rejects.toThrow();
  });

  it("estadísticas: una foto por cuenta y día, solo escribe el servidor", async () => {
    await expect(q("insert into social_daily (workspace_id,account_id,day) values ($1,$2,'2026-10-06')", [ids.aWs, ids.acc])).rejects.toThrow();
    await expect(as(ids.alice, (c) => c.query("insert into social_daily (workspace_id,account_id,day) values ($1,$2,'2026-10-05')", [ids.aWs, ids.acc]))).rejects.toThrow();
  });

  it("estados válidos, una red una vez por publicación y archivos con tipo permitido", async () => {
    await expect(q("update social_posts set status='enviando' where id=$1", [ids.post])).rejects.toThrow();
    await expect(q("insert into social_post_targets (workspace_id,user_id,post_id,account_id) values ($1,$2,$3,$4)", [ids.aWs, ids.alice, ids.post, ids.acc])).rejects.toThrow();
    await expect(q("insert into social_post_files (workspace_id,user_id,post_id,path,mime,size_bytes) values ($1,$2,$3,'a/b.exe','application/x-msdownload',10)", [ids.aWs, ids.alice, ids.post])).rejects.toThrow();
  });

  it("archivos en Storage solo dentro de la carpeta del propio espacio", async () => {
    expect((await as(ids.alice, (c) => c.query("insert into storage.objects (bucket_id,name) values ('social-media',$1) returning id", [`${ids.aWs}/${ids.post}/1.jpg`]))).rowCount).toBe(1);
    await expect(as(ids.bob, (c) => c.query("insert into storage.objects (bucket_id,name) values ('social-media',$1)", [`${ids.aWs}/${ids.post}/2.jpg`]))).rejects.toThrow();
  });

  it("borrar la cuenta borra sus estadísticas y sus destinos", async () => {
    await q("delete from social_accounts where id=$1", [ids.acc]);
    expect((await q("select count(*)::int n from social_daily")).rows[0].n).toBe(0);
    expect((await q("select count(*)::int n from social_post_targets where post_id=$1", [ids.post])).rows[0].n).toBe(0);
  });
});

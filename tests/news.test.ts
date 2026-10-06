import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;
const H = (c: string) => c.repeat(40).slice(0, 40);

d("Noticias: permisos y un resumen por día", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", aWs: "", bWs: "", topic: "", source: "" };
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
    ids.topic = (await q("insert into news_topics (workspace_id,user_id,name,keywords) values ($1,$2,'Ecommerce','{shopify}') returning id", [ids.aWs, ids.alice])).rows[0].id;
    ids.source = (await q("insert into news_sources (workspace_id,user_id,kind,name,url,topic_id) values ($1,$2,'rss','Xataka','https://feeds.weblogssl.com/xataka2',$3) returning id", [ids.aWs, ids.alice, ids.topic])).rows[0].id;
    await q("insert into news_items (workspace_id,user_id,source_id,topic_id,source_kind,url,url_hash,title,title_key) values ($1,$2,$3,$4,'rss','https://x.es/1',$5,'Shopify baja comisiones','baja comisiones shopify')", [ids.aWs, ids.alice, ids.source, ids.topic, H("a")]);
  });
  afterAll(async () => { await db.end(); });

  it("ajustes por defecto: activado, 8:00 y fines de semana", async () => {
    expect((await q("select news_enabled, news_time::text, news_weekends from profiles where user_id=$1", [ids.alice])).rows[0]).toEqual({ news_enabled: true, news_time: "08:00:00", news_weekends: true });
  });

  it("temas, fuentes y noticias: cada espacio ve solo lo suyo", async () => {
    for (const t of ["news_topics", "news_sources", "news_items"]) {
      expect((await as(ids.alice, (c) => c.query(`select id from ${t}`))).rows.length, t).toBe(1);
      expect((await as(ids.bob, (c) => c.query(`select id from ${t}`))).rows.length, t).toBe(0);
    }
    expect((await as(ids.bob, (c) => c.query("update news_items set feedback='hidden'"))).rowCount).toBe(0);
    await expect(as(ids.bob, (c) => c.query("insert into news_sources (workspace_id,user_id,kind,name,url) values ($1,$2,'rss','x','https://x.es/rss')", [ids.aWs, ids.bob]))).rejects.toThrow();
    // Una fuente de otro espacio no puede usar mi tema.
    await expect(q("insert into news_sources (workspace_id,user_id,kind,name,url,topic_id) values ($1,$2,'rss','x','https://y.es/rss',$3)", [ids.bWs, ids.bob, ids.topic])).rejects.toThrow();
  });

  it("noticias sin duplicar por enlace y solo con datos válidos", async () => {
    await expect(q("insert into news_items (workspace_id,user_id,source_kind,url,url_hash,title,title_key) values ($1,$2,'rss','https://x.es/1',$3,'Otra','otra')", [ids.aWs, ids.alice, H("a")])).rejects.toThrow();
    const r = await q("insert into news_items (workspace_id,user_id,source_kind,url,url_hash,title,title_key) values ($1,$2,'rss','https://x.es/1',$3,'Otra','otra') on conflict (workspace_id,url_hash) do nothing returning id", [ids.aWs, ids.alice, H("a")]);
    expect(r.rowCount).toBe(0);
    await expect(q("insert into news_items (workspace_id,user_id,source_kind,url,url_hash,title,title_key,image_url) values ($1,$2,'rss','https://x.es/2',$3,'T','t','javascript:alert(1)')", [ids.aWs, ids.alice, H("b")])).rejects.toThrow();
    await expect(q("insert into news_sources (workspace_id,user_id,kind,name,url) values ($1,$2,'x','X','https://x.com/api')", [ids.aWs, ids.alice])).rejects.toThrow(); // X no existe como tipo
  });

  it("un solo resumen por persona y día (la segunda ejecución del cron no crea otro) y solo lo ve su dueño", async () => {
    const ins = "insert into news_digests (user_id,workspace_id,day,status,content) values ($1,$2,'2026-10-06','ai','{\"items\":[]}') on conflict (user_id,workspace_id,day) do nothing returning id";
    expect((await q(ins, [ids.alice, ids.aWs])).rowCount).toBe(1);
    expect((await q(ins, [ids.alice, ids.aWs])).rowCount).toBe(0);
    expect((await q("select count(*)::int n from news_digests where user_id=$1", [ids.alice])).rows[0].n).toBe(1);
    expect((await as(ids.bob, (c) => c.query("select id from news_digests"))).rows).toEqual([]);
    await expect(q("update news_digests set manual_runs=3 where user_id=$1", [ids.alice])).rejects.toThrow(); // «Generar ahora»: máx. 2 al día
  });

  it("el resumen de noticias cuenta en el consumo de IA", async () => {
    await q("insert into ai_usage (workspace_id,user_id,feature,model,ok) values ($1,$2,'news','gemini',true)", [ids.aWs, ids.alice]);
  });
});

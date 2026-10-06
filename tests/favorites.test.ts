import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

d("Favoritos: permisos y reglas", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", aWs: "", bWs: "", aVideo: "", bVideo: "", aCat: "" };
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
    ids.aCat = (await q("insert into video_categories (workspace_id,user_id,name) values ($1,$2,'Marketing') returning id", [ids.aWs, ids.alice])).rows[0].id;
    ids.aVideo = (await q("insert into saved_videos (workspace_id,user_id,source,external_id,url,title,summary,category_id) values ($1,$2,'youtube','dQw4w9WgXcQ','https://www.youtube.com/watch?v=dQw4w9WgXcQ','Cómo vender camisetas','Estrategias de publicidad para tiendas de ropa',$3) returning id", [ids.aWs, ids.alice, ids.aCat])).rows[0].id;
    ids.bVideo = (await q("insert into saved_videos (workspace_id,user_id,source,url,title) values ($1,$2,'tiktok','https://www.tiktok.com/@b/video/7234567890123456789','Vídeo de Bob') returning id", [ids.bWs, ids.bob])).rows[0].id;
    await q("insert into integrations (user_id,workspace_id,provider,refresh_token_enc,account_email) values ($1,$2,'google','v1.x.y.z','a@gmail.com'),($3,$4,'google','v1.x.y.z','b@gmail.com')", [ids.alice, ids.aWs, ids.bob, ids.bWs]);
  });
  afterAll(async () => { await db.end(); });

  it("youtube_feeds: cada uno ve y toca solo las suyas; id validado y sin duplicados", async () => {
    await q("insert into youtube_feeds (workspace_id,user_id,playlist_id) values ($1,$2,'PLaliceaaaaaaaaaa'),($3,$4,'PLbobbbbbbbbbbbbb')", [ids.aWs, ids.alice, ids.bWs, ids.bob]);
    const mine = await as(ids.alice, (c) => c.query("select playlist_id from youtube_feeds"));
    expect(mine.rows.map((r) => r.playlist_id)).toEqual(["PLaliceaaaaaaaaaa"]);
    const del = await as(ids.alice, (c) => c.query("delete from youtube_feeds where playlist_id='PLbobbbbbbbbbbbbb'"));
    expect(del.rowCount).toBe(0);
    await expect(as(ids.alice, (c) => c.query("insert into youtube_feeds (workspace_id,user_id,playlist_id) values ($1,$2,'PLxxxxxxxxxxxxxxx')", [ids.bWs, ids.alice]))).rejects.toThrow();
    await expect(as(ids.alice, (c) => c.query("insert into youtube_feeds (workspace_id,user_id,playlist_id) values ($1,$2,'PL<script>x')", [ids.aWs, ids.alice]))).rejects.toThrow();
    await expect(as(ids.alice, (c) => c.query("insert into youtube_feeds (workspace_id,user_id,playlist_id) values ($1,$2,'PLaliceaaaaaaaaaa')", [ids.aWs, ids.alice]))).rejects.toThrow();
  });

  it.each(["saved_videos", "video_categories"])("%s: aislamiento entre usuarios", async (t) => {
    const r = await as(ids.alice, (c) => c.query(`select workspace_id from ${t}`));
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.every((x) => x.workspace_id === ids.aWs)).toBe(true);
  });

  it("no permite insertar en el espacio de otro", async () => {
    await expect(as(ids.alice, (c) => c.query("insert into saved_videos (workspace_id,user_id,source,url) values ($1,$2,'other','https://x.test/1')", [ids.bWs, ids.alice]))).rejects.toThrow();
    await expect(as(ids.alice, (c) => c.query("insert into saved_videos (workspace_id,user_id,source,url) values ($1,$2,'other','https://x.test/2')", [ids.aWs, ids.bob]))).rejects.toThrow();
  });

  it("no hay duplicados por id de vídeo ni por URL", async () => {
    await expect(as(ids.alice, (c) => c.query("insert into saved_videos (workspace_id,user_id,source,external_id,url) values ($1,$2,'youtube','dQw4w9WgXcQ','https://otra.url/x')", [ids.aWs, ids.alice]))).rejects.toThrow(/duplicate|unique/i);
    await expect(as(ids.alice, (c) => c.query("insert into saved_videos (workspace_id,user_id,source,url) values ($1,$2,'other','https://www.youtube.com/watch?v=dQw4w9WgXcQ')", [ids.aWs, ids.alice]))).rejects.toThrow(/duplicate|unique/i);
  });

  it("no se puede usar una categoría de otro espacio", async () => {
    await expect(as(ids.bob, (c) => c.query("update saved_videos set category_id=$1 where id=$2", [ids.aCat, ids.bVideo]))).rejects.toThrow();
  });

  it("al borrar una categoría, sus vídeos quedan sin categoría", async () => {
    const r = await as(ids.alice, async (c) => {
      await c.query("delete from video_categories where id=$1", [ids.aCat]);
      return c.query("select category_id from saved_videos where id=$1", [ids.aVideo]);
    });
    expect(r.rows[0].category_id).toBeNull();
  });

  it("la búsqueda global encuentra vídeos (con prefijo y sin tildes) solo del propio espacio", async () => {
    const r = await as(ids.alice, (c) => c.query("select kind, id from search_all($1, 'publicid camiset', 10)", [ids.aWs]));
    expect(r.rows).toEqual([{ kind: "video", id: ids.aVideo }]);
    const none = await as(ids.alice, (c) => c.query("select * from search_all($1, 'Bob', 10)", [ids.aWs]));
    expect(none.rows).toHaveLength(0);
  });

  it("borrar un vídeo limpia sus etiquetas", async () => {
    const left = await as(ids.alice, async (c) => {
      const tag = (await c.query("insert into tags (workspace_id,user_id,name) values ($1,$2,'ropa') returning id", [ids.aWs, ids.alice])).rows[0].id;
      await c.query("insert into taggings (workspace_id,user_id,tag_id,item_type,item_id) values ($1,$2,$3,'video',$4)", [ids.aWs, ids.alice, tag, ids.aVideo]);
      await c.query("delete from saved_videos where id=$1", [ids.aVideo]);
      return c.query("select 1 from taggings where item_id=$1", [ids.aVideo]);
    });
    expect(left.rows).toHaveLength(0);
  });

  describe("integraciones (token de Google)", () => {
    it("cada persona solo ve la suya", async () => {
      const r = await as(ids.alice, (c) => c.query("select account_email from integrations"));
      expect(r.rows).toEqual([{ account_email: "a@gmail.com" }]);
    });
    it("el token cifrado no se puede leer desde el navegador", async () => {
      await expect(as(ids.alice, (c) => c.query("select refresh_token_enc from integrations"))).rejects.toThrow(/permission denied/i);
      await expect(as(ids.alice, (c) => c.query("select * from integrations"))).rejects.toThrow(/permission denied/i);
    });
    it("no se puede crear ni cambiar el token desde el navegador", async () => {
      await expect(as(ids.alice, (c) => c.query("insert into integrations (user_id,workspace_id,provider,refresh_token_enc) values ($1,$2,'google','x')", [ids.alice, ids.aWs]))).rejects.toThrow();
      await expect(as(ids.alice, (c) => c.query("update integrations set refresh_token_enc='x'"))).rejects.toThrow(/permission denied/i);
    });
    it("sí puede cambiar qué sincroniza y desconectar, pero solo lo suyo", async () => {
      const upd = await as(ids.alice, (c) => c.query("update integrations set sync_likes=false returning user_id"));
      expect(upd.rows).toEqual([{ user_id: ids.alice }]);
      const del = await as(ids.bob, (c) => c.query("delete from integrations where user_id=$1", [ids.alice]));
      expect(del.rowCount).toBe(0);
    });
  });
});

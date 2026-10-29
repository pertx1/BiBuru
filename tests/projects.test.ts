import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

/** Proyectos: categorías con subcategorías, también para notas y tareas. */
d("Proyectos (categorías con subcategorías)", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", aWs: "", bWs: "", ia: "", claude: "", bCat: "" };
  const q = (sql: string, p: unknown[] = []) => db.query(sql, p);
  async function as<T>(uid: string, fn: (c: Client) => Promise<T>) {
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      return await fn(db);
    } finally { await db.query("rollback"); }
  }
  const cat = (ws: string, uid: string, name: string, parent: string | null = null) => q("insert into video_categories (workspace_id,user_id,name,parent_id) values ($1,$2,$3,$4) returning id", [ws, uid, name, parent]).then((r) => r.rows[0].id as string);
  beforeAll(async () => {
    await db.connect();
    await q("truncate auth.users cascade");
    ids.alice = (await q("insert into auth.users (email) values ('a@x.com') returning id")).rows[0].id;
    ids.bob = (await q("insert into auth.users (email) values ('b@x.com') returning id")).rows[0].id;
    ids.aWs = (await q("select id from workspaces where owner_id=$1", [ids.alice])).rows[0].id;
    ids.bWs = (await q("select id from workspaces where owner_id=$1", [ids.bob])).rows[0].id;
    ids.ia = await cat(ids.aWs, ids.alice, "IA");
    ids.claude = await cat(ids.aWs, ids.alice, "Claude", ids.ia);
    ids.bCat = await cat(ids.bWs, ids.bob, "Secreta");
  });
  afterAll(async () => { await db.end(); });

  it("el mismo nombre vale bajo padres distintos, pero no repetido en el mismo sitio", async () => {
    const mk = await cat(ids.aWs, ids.alice, "Marketing");
    await cat(ids.aWs, ids.alice, "Otros", ids.ia);
    await cat(ids.aWs, ids.alice, "Otros", mk);
    await expect(cat(ids.aWs, ids.alice, "otros", ids.ia)).rejects.toThrow(/duplicate|unique/i);
    await expect(cat(ids.aWs, ids.alice, "ia")).rejects.toThrow(/duplicate|unique/i);
  });

  it("sin ciclos: ni dentro de sí misma ni de una subcategoría suya", async () => {
    await expect(q("update video_categories set parent_id=$1 where id=$1", [ids.ia])).rejects.toThrow(/sí misma/);
    await expect(q("update video_categories set parent_id=$1 where id=$2", [ids.claude, ids.ia])).rejects.toThrow(/subcategorías/);
  });

  it("no se puede colgar de una categoría de otra cuenta, ni usarla en notas o tareas", async () => {
    await expect(q("insert into video_categories (workspace_id,user_id,name,parent_id) values ($1,$2,'X',$3)", [ids.aWs, ids.alice, ids.bCat])).rejects.toThrow(/foreign key/);
    await expect(as(ids.alice, (c) => c.query("insert into notes (workspace_id,user_id,title,category_id) values ($1,$2,'n',$3)", [ids.aWs, ids.alice, ids.bCat]))).rejects.toThrow(/foreign key/);
    await expect(as(ids.alice, (c) => c.query("insert into tasks (workspace_id,user_id,title,category_id) values ($1,$2,'t',$3)", [ids.aWs, ids.alice, ids.bCat]))).rejects.toThrow(/foreign key/);
    const ok = await as(ids.alice, (c) => c.query("insert into tasks (workspace_id,user_id,title,category_id) values ($1,$2,'Probar Claude Code',$3) returning id", [ids.aWs, ids.alice, ids.claude]));
    expect(ok.rowCount).toBe(1);
  });

  it("borrar una categoría deja sus notas/tareas sin categoría y sube sus subcategorías", async () => {
    const tmp = await cat(ids.aWs, ids.alice, "Temporal");
    const child = await cat(ids.aWs, ids.alice, "Hija", tmp);
    const n = (await q("insert into notes (workspace_id,user_id,title,category_id) values ($1,$2,'n',$3) returning id", [ids.aWs, ids.alice, tmp])).rows[0].id;
    await q("delete from video_categories where id=$1", [tmp]);
    expect((await q("select category_id from notes where id=$1", [n])).rows[0].category_id).toBeNull();
    expect((await q("select parent_id from video_categories where id=$1", [child])).rows[0].parent_id).toBeNull();
  });

  it("cada cuenta ve solo sus categorías", async () => {
    const r = await as(ids.bob, (c) => c.query("select name from video_categories"));
    expect(r.rows.map((x) => x.name)).toEqual(["Secreta"]);
  });
});

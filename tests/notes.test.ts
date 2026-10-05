import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

d("Bandeja, notas, carpetas, etiquetas y búsqueda", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", aWs: "", bWs: "", aBiz: "", bBiz: "" };

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
    ids.aBiz = (await q("insert into businesses (workspace_id,user_id,name) values ($1,$2,'Akerra') returning id", [ids.aWs, ids.alice])).rows[0].id;
    ids.bBiz = (await q("insert into businesses (workspace_id,user_id,name) values ($1,$2,'Otro') returning id", [ids.bWs, ids.bob])).rows[0].id;
    await q("insert into notes (workspace_id,user_id,title,body) values ($1,$2,'Ideas de colección','Diseñar camisetas con motivos de la costa vasca y sudaderas')", [ids.aWs, ids.alice]);
    await q("insert into notes (workspace_id,user_id,title,body) values ($1,$2,'Secreto de Bob','Las camisetas de Bob son un secreto')", [ids.bWs, ids.bob]);
    await q("insert into tasks (workspace_id,user_id,title,notes) values ($1,$2,'Llamar a la imprenta','Preguntar por el presupuesto de los DTF')", [ids.aWs, ids.alice]);
    const o = (await q("insert into orders (workspace_id,user_id,business_id,customer,order_number) values ($1,$2,$3,'Maite Etxebarria','124') returning id", [ids.aWs, ids.alice, ids.aBiz])).rows[0].id;
    await q("insert into order_items (workspace_id,user_id,order_id,product_name,color,size,quantity,unit_price_cents) values ($1,$2,$3,'Gaztelugatxe','Negra','M',2,2500)", [ids.aWs, ids.alice, o]);
    await q("insert into expenses (workspace_id,user_id,business_id,concept,supplier,amount_cents) values ($1,$2,$3,'Cinta de embalar','Amazon',1250)", [ids.aWs, ids.alice, ids.aBiz]);
  });
  afterAll(async () => { await db.end(); });

  it.each(["folders", "notes", "tags", "taggings", "inbox_items"])("%s: aislamiento entre usuarios", async (t) => {
    await q(`delete from ${t} where false`);
    const r = await as(ids.alice, (c) => c.query(`select workspace_id from ${t}`));
    expect(r.rows.every((x) => x.workspace_id === ids.aWs)).toBe(true);
    await expect(as(ids.alice, (c) => c.query(`insert into ${t} (workspace_id,user_id) values ($1,$2)`, [ids.bWs, ids.alice]))).rejects.toThrow(/row-level|null value|violates/);
  });

  describe("búsqueda global", () => {
    const search = (uid: string, ws: string, term: string) =>
      as(uid, (c) => c.query("select kind, title, snippet from search_all($1,$2)", [ws, term])).then((r) => r.rows);

    it("encuentra por raíz de la palabra (camiseta ↔ camisetas) en notas", async () => {
      const r = await search(ids.alice, ids.aWs, "camiseta");
      expect(r.map((x) => x.kind)).toContain("note");
      expect(r.find((x) => x.kind === "note")!.title).toBe("Ideas de colección");
    });
    it("busca mientras se escribe (prefijos)", async () => {
      expect((await search(ids.alice, ids.aWs, "impre")).map((x) => x.kind)).toEqual(["task"]);
      expect((await search(ids.alice, ids.aWs, "gaztel")).map((x) => x.kind)).toEqual(["order"]);
    });
    it("pedidos por cliente, número o producto; gastos por concepto o proveedor", async () => {
      expect((await search(ids.alice, ids.aWs, "maite"))[0]).toMatchObject({ kind: "order", title: "Maite Etxebarria" });
      expect((await search(ids.alice, ids.aWs, "124"))[0].kind).toBe("order");
      expect((await search(ids.alice, ids.aWs, "cinta"))[0]).toMatchObject({ kind: "expense", title: "Cinta de embalar" });
      expect((await search(ids.alice, ids.aWs, "amazon"))[0].kind).toBe("expense");
    });
    it("varias palabras: todas deben aparecer", async () => {
      expect((await search(ids.alice, ids.aWs, "presupuesto dtf")).map((x) => x.kind)).toEqual(["task"]);
      expect(await search(ids.alice, ids.aWs, "presupuesto vasca")).toEqual([]);
    });
    it("nunca devuelve datos de otro usuario, ni aunque se pida su workspace", async () => {
      expect((await search(ids.alice, ids.aWs, "secreto"))).toEqual([]);
      expect((await search(ids.alice, ids.bWs, "secreto"))).toEqual([]);
    });
    it("entradas raras no rompen la búsqueda", async () => {
      for (const t of ["", "   ", "'; drop table notes; --", "a:*|b!", "(((", "&&&"]) {
        await expect(search(ids.alice, ids.aWs, t)).resolves.toBeDefined();
      }
    });
  });

  it("las carpetas no pueden formar ciclos", async () => {
    const a = (await q("insert into folders (workspace_id,user_id,name) values ($1,$2,'A') returning id", [ids.aWs, ids.alice])).rows[0].id;
    const b = (await q("insert into folders (workspace_id,user_id,name,parent_id) values ($1,$2,'B',$3) returning id", [ids.aWs, ids.alice, a])).rows[0].id;
    const c = (await q("insert into folders (workspace_id,user_id,name,parent_id) values ($1,$2,'C',$3) returning id", [ids.aWs, ids.alice, b])).rows[0].id;
    await expect(q("update folders set parent_id=$1 where id=$2", [c, a])).rejects.toThrow(/subcarpetas/);
    await expect(q("update folders set parent_id=id where id=$1", [a])).rejects.toThrow(/sí misma/);
    await expect(q("update folders set parent_id=null where id=$1", [c])).resolves.toBeDefined();
  });

  it("borrar una carpeta no borra sus notas (pasan a la raíz) y sí sus subcarpetas", async () => {
    const f = (await q("insert into folders (workspace_id,user_id,name) values ($1,$2,'Temp') returning id", [ids.aWs, ids.alice])).rows[0].id;
    const sub = (await q("insert into folders (workspace_id,user_id,name,parent_id) values ($1,$2,'Sub',$3) returning id", [ids.aWs, ids.alice, f])).rows[0].id;
    const n = (await q("insert into notes (workspace_id,user_id,title,folder_id) values ($1,$2,'En carpeta',$3) returning id", [ids.aWs, ids.alice, f])).rows[0].id;
    await q("delete from folders where id=$1", [f]);
    expect((await q("select folder_id, workspace_id from notes where id=$1", [n])).rows[0]).toMatchObject({ folder_id: null, workspace_id: ids.aWs });
    expect((await q("select count(*)::int c from folders where id=$1", [sub])).rows[0].c).toBe(0);
  });

  it("las etiquetas se comparten entre elementos y se limpian al borrar la nota o la tarea", async () => {
    const tag = (await q("insert into tags (workspace_id,user_id,name) values ($1,$2,'Idea') returning id", [ids.aWs, ids.alice])).rows[0].id;
    await expect(q("insert into tags (workspace_id,user_id,name) values ($1,$2,'idea')", [ids.aWs, ids.alice])).rejects.toThrow(/unique|duplicate/); // sin distinguir mayúsculas
    const note = (await q("insert into notes (workspace_id,user_id,title) values ($1,$2,'n') returning id", [ids.aWs, ids.alice])).rows[0].id;
    const task = (await q("insert into tasks (workspace_id,user_id,title) values ($1,$2,'t') returning id", [ids.aWs, ids.alice])).rows[0].id;
    await q("insert into taggings (workspace_id,user_id,tag_id,item_type,item_id) values ($1,$2,$3,'note',$4),($1,$2,$3,'task',$5)", [ids.aWs, ids.alice, tag, note, task]);
    await q("delete from notes where id=$1", [note]);
    await q("delete from tasks where id=$1", [task]);
    expect((await q("select count(*)::int c from taggings where tag_id=$1", [tag])).rows[0].c).toBe(0);
  });

  it("la bandeja es idempotente por client_id (reenviar tras un corte no duplica)", async () => {
    const cid = "11111111-1111-4111-8111-111111111111";
    await q("insert into inbox_items (workspace_id,user_id,client_id,raw_text) values ($1,$2,$3,'idea')", [ids.aWs, ids.alice, cid]);
    await expect(q("insert into inbox_items (workspace_id,user_id,client_id,raw_text) values ($1,$2,$3,'idea')", [ids.aWs, ids.alice, cid])).rejects.toThrow(/unique|duplicate/);
    await q("insert into inbox_items (workspace_id,user_id,client_id,raw_text) values ($1,$2,$3,'idea') on conflict (workspace_id, client_id) do nothing", [ids.aWs, ids.alice, cid]);
    expect((await q("select count(*)::int c from inbox_items where client_id=$1", [cid])).rows[0].c).toBe(1);
  });

  it("restricciones de la bandeja", async () => {
    await expect(q("insert into inbox_items (workspace_id,user_id,client_id,raw_text) values ($1,$2,gen_random_uuid(),'')", [ids.aWs, ids.alice])).rejects.toThrow(/check/);
    await expect(q("insert into inbox_items (workspace_id,user_id,client_id,raw_text,status) values ($1,$2,gen_random_uuid(),'x','raro')", [ids.aWs, ids.alice])).rejects.toThrow(/check/);
  });
});

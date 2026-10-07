import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

d("Stock: artículos, movimientos, mínimos y una tarea abierta por artículo", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", aWs: "", bWs: "", biz: "", item: "" };
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
    ids.item = (await q("insert into stock_items (workspace_id,user_id,business_id,name,variant,quantity,min_quantity) values ($1,$2,$3,'Camiseta negra','M',4,2) returning id", [ids.aWs, ids.alice, ids.biz])).rows[0].id;
    await q("insert into stock_movements (workspace_id,user_id,business_id,item_key,label,kind,delta) values ($1,$2,$3,$4,'Camiseta negra M','entrada',4)", [ids.aWs, ids.alice, ids.biz, `item|${ids.item}`]);
  });
  afterAll(async () => { await db.end(); });

  it("cada espacio ve solo su stock y sus movimientos", async () => {
    for (const t of ["stock_items", "stock_movements"]) {
      expect((await as(ids.alice, (c) => c.query(`select id from ${t}`))).rows.length, t).toBe(1);
      expect((await as(ids.bob, (c) => c.query(`select id from ${t}`))).rows.length, t).toBe(0);
    }
    expect((await as(ids.bob, (c) => c.query("update stock_items set quantity=999"))).rowCount).toBe(0);
    await expect(as(ids.bob, (c) => c.query("insert into stock_items (workspace_id,user_id,business_id,name) values ($1,$2,$3,'x')", [ids.bWs, ids.bob, ids.biz]))).rejects.toThrow();
  });

  it("sin duplicados por nombre y variante, mínimo no negativo y movimientos distintos de 0", async () => {
    await expect(q("insert into stock_items (workspace_id,user_id,business_id,name,variant) values ($1,$2,$3,'Camiseta negra','M')", [ids.aWs, ids.alice, ids.biz])).rejects.toThrow();
    await expect(q("update stock_items set min_quantity=-1 where id=$1", [ids.item])).rejects.toThrow();
    await expect(q("insert into stock_movements (workspace_id,user_id,business_id,item_key,label,kind,delta) values ($1,$2,$3,'item|x','x','ajuste',0)", [ids.aWs, ids.alice, ids.biz])).rejects.toThrow();
    await expect(q("insert into stock_movements (workspace_id,user_id,business_id,item_key,label,kind,delta) values ($1,$2,$3,'item|x','x','robo',1)", [ids.aWs, ids.alice, ids.biz])).rejects.toThrow();
  });

  it("una sola tarea «Reponer» abierta por artículo; completada deja abrir otra", async () => {
    const ins = "insert into tasks (workspace_id,user_id,business_id,title,stock_key,stock_missing) values ($1,$2,$3,'Reponer: Camiseta negra M, faltan 6','item|x',6) returning id";
    const first = (await q(ins, [ids.aWs, ids.alice, ids.biz])).rows[0].id;
    await expect(q(ins, [ids.aWs, ids.alice, ids.biz])).rejects.toThrow();
    await q("update tasks set status='done', completed_at=now() where id=$1", [first]);
    expect((await q(ins, [ids.aWs, ids.alice, ids.biz])).rowCount).toBe(1);
  });

  it("mínimos en el stock de Producción, con 0 por defecto", async () => {
    const r = await q("insert into tshirt_stocks (workspace_id,user_id,business_id,model,size,quantity) values ($1,$2,$3,'Negra','M',3) returning min_quantity", [ids.aWs, ids.alice, ids.biz]);
    expect(r.rows[0].min_quantity).toBe(0);
  });
});

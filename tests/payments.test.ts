import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

d("Pedidos: cobros, pendiente calculado y permisos", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", aWs: "", bWs: "", biz: "", order: "" };
  async function as<T>(uid: string, fn: (c: Client) => Promise<T>) {
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      return await fn(db);
    } finally { await db.query("rollback"); }
  }
  const q = (sql: string, p: unknown[] = []) => db.query(sql, p);
  const order = async (total: number, extra = "") => {
    const id = (await q(`insert into orders (workspace_id,user_id,business_id,order_date${extra ? ",status" : ""}) values ($1,$2,$3,'2026-09-01'${extra ? `,'${extra}'` : ""}) returning id`, [ids.aWs, ids.alice, ids.biz])).rows[0].id;
    await q("insert into order_items (workspace_id,user_id,order_id,product_name,quantity,unit_price_cents,unit_cost_cents) values ($1,$2,$3,'Camiseta',1,$4,0)", [ids.aWs, ids.alice, id, total]);
    return id as string;
  };
  const row = async (id: string) => (await q("select payment_reviewed, paid_cents::int, due_cents::int, total_cents::int from orders where id=$1", [id])).rows[0];

  beforeAll(async () => {
    await db.connect();
    await q("truncate auth.users cascade");
    ids.alice = (await q("insert into auth.users (email) values ('a@x.com') returning id")).rows[0].id;
    ids.bob = (await q("insert into auth.users (email) values ('b@x.com') returning id")).rows[0].id;
    ids.aWs = (await q("select id from workspaces where owner_id=$1", [ids.alice])).rows[0].id;
    ids.bWs = (await q("select id from workspaces where owner_id=$1", [ids.bob])).rows[0].id;
    ids.biz = (await q("insert into businesses (workspace_id,user_id,name) values ($1,$2,'Akerra') returning id", [ids.aWs, ids.alice])).rows[0].id;
    ids.order = await order(3000);
  });
  afterAll(async () => { await db.end(); });

  it("los pedidos nuevos nacen revisados y lo pendiente es el total", async () => {
    expect(await row(ids.order)).toEqual({ payment_reviewed: true, paid_cents: 0, due_cents: 3000, total_cents: 3000 });
  });

  it("los cobros suman y el pendiente se recalcula solo (parcial, pagado, borrado)", async () => {
    const p1 = (await q("insert into order_payments (workspace_id,user_id,order_id,paid_on,amount_cents,method) values ($1,$2,$3,'2026-09-02',1000,'bizum') returning id", [ids.aWs, ids.alice, ids.order])).rows[0].id;
    expect(await row(ids.order)).toMatchObject({ paid_cents: 1000, due_cents: 2000 });
    await q("insert into order_payments (workspace_id,user_id,order_id,paid_on,amount_cents,method) values ($1,$2,$3,'2026-09-05',2500,'efectivo')", [ids.aWs, ids.alice, ids.order]);
    expect(await row(ids.order)).toMatchObject({ paid_cents: 3500, due_cents: 0 });
    await q("delete from order_payments where id=$1", [p1]);
    expect(await row(ids.order)).toMatchObject({ paid_cents: 2500, due_cents: 500 });
  });

  it("sin revisar o cancelado no cuenta como deuda; un cobro lo marca como revisado", async () => {
    const old = await order(4000);
    await q("update orders set payment_reviewed=false where id=$1", [old]);
    expect(await row(old)).toMatchObject({ due_cents: 0 });
    await q("insert into order_payments (workspace_id,user_id,order_id,paid_on,amount_cents) values ($1,$2,$3,'2026-09-03',1000)", [ids.aWs, ids.alice, old]);
    expect(await row(old)).toMatchObject({ payment_reviewed: true, due_cents: 3000 });
    const cancelled = await order(5000, "cancelado");
    expect(await row(cancelled)).toMatchObject({ due_cents: 0 });
  });

  it("importe positivo y método válido", async () => {
    await expect(q("insert into order_payments (workspace_id,user_id,order_id,paid_on,amount_cents) values ($1,$2,$3,'2026-09-03',0)", [ids.aWs, ids.alice, ids.order])).rejects.toThrow();
    await expect(q("insert into order_payments (workspace_id,user_id,order_id,paid_on,amount_cents,method) values ($1,$2,$3,'2026-09-03',100,'paypal')", [ids.aWs, ids.alice, ids.order])).rejects.toThrow();
  });

  it("cada espacio ve solo sus cobros y no puede cobrar pedidos ajenos", async () => {
    expect((await as(ids.alice, (c) => c.query("select id from order_payments"))).rows.length).toBeGreaterThan(0);
    expect((await as(ids.bob, (c) => c.query("select id from order_payments"))).rows.length).toBe(0);
    await expect(as(ids.bob, (c) => c.query("insert into order_payments (workspace_id,user_id,order_id,paid_on,amount_cents) values ($1,$2,$3,'2026-09-03',100)", [ids.bWs, ids.bob, ids.order]))).rejects.toThrow();
    expect((await as(ids.bob, (c) => c.query("delete from order_payments"))).rowCount).toBe(0);
  });

  it("stats_collections: cobrado por fecha de cobro y pendiente por mes del pedido", async () => {
    const rows = (await as(ids.alice, (c) => c.query("select month::text, collected_cents::int, pending_cents::int from stats_collections($1,'2026-09-01','2026-09-30')", [ids.aWs]))).rows;
    expect(rows).toEqual([{ month: "2026-09-01", collected_cents: 3500, pending_cents: 3500 }]);
  });
});

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

  it("pedidos de la web: salen pagados solos y se ajustan al total, cobros a mano, cancelación y «No pagado»", async () => {
    const autos = async (id: string) => (await q("select amount_cents::int a, paid_on::text d, method from order_payments where order_id=$1 and auto_web", [id])).rows;
    // Creado como haría la app (con RLS): canal «Tienda web».
    const id = await as(ids.alice, async (c) => {
      const o = (await c.query("insert into orders (workspace_id,user_id,business_id,order_date,channel) values ($1,$2,$3,'2026-09-10','Tienda web') returning id", [ids.aWs, ids.alice, ids.biz])).rows[0].id;
      await c.query("insert into order_items (workspace_id,user_id,order_id,product_name,quantity,unit_price_cents) values ($1,$2,$3,'Camiseta',2,1500)", [ids.aWs, ids.alice, o]);
      const r = (await c.query("select paid_cents::int, due_cents::int from orders where id=$1", [o])).rows[0];
      expect(r).toEqual({ paid_cents: 3000, due_cents: 0 });
      return o;
    });
    expect(id).toBeTruthy();

    const w = (await q("insert into orders (workspace_id,user_id,business_id,order_date,channel) values ($1,$2,$3,'2026-09-10','Web') returning id", [ids.aWs, ids.alice, ids.biz])).rows[0].id;
    await q("insert into order_items (workspace_id,user_id,order_id,product_name,quantity,unit_price_cents) values ($1,$2,$3,'Sudadera',1,4000)", [ids.aWs, ids.alice, w]);
    expect(await autos(w)).toEqual([{ a: 4000, d: "2026-09-10", method: "tarjeta" }]);
    expect(await row(w)).toMatchObject({ paid_cents: 4000, due_cents: 0 });
    // Cambia el total: el cobro automático se ajusta.
    await q("update order_items set quantity=2 where order_id=$1", [w]);
    expect(await row(w)).toMatchObject({ paid_cents: 8000, due_cents: 0 });
    // Un cobro a mano: el automático cubre solo el resto (no se pasa del total).
    await q("insert into order_payments (workspace_id,user_id,order_id,paid_on,amount_cents,method) values ($1,$2,$3,'2026-09-11',3000,'bizum')", [ids.aWs, ids.alice, w]);
    expect((await autos(w))[0].a).toBe(5000);
    expect(await row(w)).toMatchObject({ paid_cents: 8000, due_cents: 0 });
    // Cancelado: se quita el automático; vuelve a la web activa: vuelve.
    await q("update orders set status='cancelado' where id=$1", [w]);
    expect(await autos(w)).toEqual([]);
    await q("update orders set status='sin_hacer' where id=$1", [w]);
    expect((await autos(w))[0].a).toBe(5000);
    // «No pagado» a mano (auto_paid_off): se respeta aunque se edite el pedido.
    await q("delete from order_payments where order_id=$1", [w]);
    await q("update orders set auto_paid_off=true where id=$1", [w]);
    await q("update order_items set quantity=3 where order_id=$1", [w]);
    expect(await row(w)).toMatchObject({ paid_cents: 0, due_cents: 12000 });
    await q("update orders set auto_paid_off=false where id=$1", [w]);
    expect(await row(w)).toMatchObject({ paid_cents: 12000, due_cents: 0 });
    // Otros canales no; «website»/«webinar» tampoco cuentan como la palabra «web».
    for (const ch of ["Instagram", "Webinar", null]) {
      const o = (await q("insert into orders (workspace_id,user_id,business_id,order_date,channel) values ($1,$2,$3,'2026-09-10',$4) returning id", [ids.aWs, ids.alice, ids.biz, ch])).rows[0].id;
      await q("insert into order_items (workspace_id,user_id,order_id,product_name,quantity,unit_price_cents) values ($1,$2,$3,'X',1,1000)", [ids.aWs, ids.alice, o]);
      expect(await row(o)).toMatchObject({ paid_cents: 0, due_cents: 1000 });
      await q("delete from orders where id=$1", [o]);
    }
    // Dejar de ser de la web quita el cobro automático.
    await q("update orders set channel='Instagram' where id=$1", [w]);
    expect(await autos(w)).toEqual([]);
    await expect(as(ids.bob, (c) => c.query("select public.sync_web_payment($1)", [w]))).rejects.toThrow(/permission/);
    await q("delete from orders where id in ($1,$2)", [w, id]);
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

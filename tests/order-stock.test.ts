import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

/** Cada pedido resta del stock (apply_order_stock + triggers), en una transacción y sin descontar dos veces. */
d("Pedidos que descuentan stock", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", ws: "", bWs: "", biz: "", item: "" };
  const q = (sql: string, p: unknown[] = []) => db.query(sql, p);
  /** Como la persona usuaria (RLS), confirmando al final (no es rollback: así se ve el efecto de verdad). */
  async function asUser<T>(c: Client, uid: string, fn: () => Promise<T>) {
    await c.query("begin");
    try {
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      const r = await fn();
      await c.query("commit");
      return r;
    } catch (e) { await c.query("rollback"); throw e; }
  }
  const effects = (key: string, qty: number) => JSON.stringify([{ key, label: "Camiseta negra M", qty }]);
  const tshirt = async () => (await q("select quantity from tshirt_stocks where business_id=$1 and model='Negra' and size='M'", [ids.biz])).rows[0].quantity as number;
  async function newOrder(c: Client, qty: number, status = "sin_hacer") {
    return asUser(c, ids.alice, async () => {
      const o = (await c.query("insert into orders (workspace_id,user_id,business_id,status,order_number) values ($1,$2,$3,$4,'A1') returning id", [ids.ws, ids.alice, ids.biz, status])).rows[0].id as string;
      await c.query("insert into order_items (workspace_id,user_id,order_id,product_name,quantity,stock_key,stock_effects) values ($1,$2,$3,'Camiseta',$4,'tshirt|Negra|M',$5)", [ids.ws, ids.alice, o, qty, effects("tshirt|Negra|M", qty)]);
      await c.query("select * from apply_order_stock($1)", [o]);
      return o;
    });
  }

  beforeAll(async () => {
    await db.connect();
    await q("truncate auth.users cascade");
    ids.alice = (await q("insert into auth.users (email) values ('a@x.com') returning id")).rows[0].id;
    ids.bob = (await q("insert into auth.users (email) values ('b@x.com') returning id")).rows[0].id;
    ids.ws = (await q("select id from workspaces where owner_id=$1", [ids.alice])).rows[0].id;
    ids.bWs = (await q("select id from workspaces where owner_id=$1", [ids.bob])).rows[0].id;
    ids.biz = (await q("insert into businesses (workspace_id,user_id,name,production_enabled) values ($1,$2,'Akerra',true) returning id", [ids.ws, ids.alice])).rows[0].id;
    await q("insert into tshirt_stocks (workspace_id,user_id,business_id,model,size,quantity) values ($1,$2,$3,'Negra','M',10)", [ids.ws, ids.alice, ids.biz]);
    ids.item = (await q("insert into stock_items (workspace_id,user_id,business_id,name,quantity) values ($1,$2,$3,'Bolsas',5) returning id", [ids.ws, ids.alice, ids.biz])).rows[0].id;
  });
  afterAll(async () => { await db.end(); });

  it("crear un pedido descuenta y deja un movimiento ligado al pedido", async () => {
    const o = await newOrder(db, 3);
    expect(await tshirt()).toBe(7);
    const m = (await q("select kind, delta, reason, order_id, source, order_label from stock_movements where order_id=$1", [o])).rows;
    expect(m).toEqual([{ kind: "salida", delta: -3, reason: "Pedido", order_id: o, source: "pedido", order_label: "Pedido #A1" }]);
    // Volver a aplicarlo no descuenta otra vez.
    await asUser(db, ids.alice, () => db.query("select * from apply_order_stock($1)", [o]));
    expect(await tshirt()).toBe(7);
    await q("delete from orders where id=$1", [o]);
    expect(await tshirt()).toBe(10);
  });

  it("editar ajusta solo la diferencia; cambiar de artículo devuelve el anterior", async () => {
    const o = await newOrder(db, 2);
    expect(await tshirt()).toBe(8);
    await asUser(db, ids.alice, async () => {
      await db.query("update order_items set quantity=5, stock_effects=$2 where order_id=$1", [o, effects("tshirt|Negra|M", 5)]);
      return db.query("select * from apply_order_stock($1)", [o]);
    });
    expect(await tshirt()).toBe(5);
    expect((await q("select delta, reason from stock_movements where order_id=$1 order by created_at", [o])).rows.map((r) => [r.delta, r.reason])).toEqual([[-2, "Pedido"], [-3, "Pedido editado"]]);
    await asUser(db, ids.alice, async () => {
      await db.query("update order_items set quantity=1, stock_key=$2, stock_effects=$3 where order_id=$1", [o, `item|${ids.item}`, JSON.stringify([{ key: `item|${ids.item}`, label: "Bolsas", qty: 1 }])]);
      return db.query("select * from apply_order_stock($1)", [o]);
    });
    expect(await tshirt()).toBe(10);
    expect((await q("select quantity from stock_items where id=$1", [ids.item])).rows[0].quantity).toBe(4);
    await q("delete from orders where id=$1", [o]);
    expect((await q("select quantity from stock_items where id=$1", [ids.item])).rows[0].quantity).toBe(5);
  });

  it("cancelar devuelve el stock y des-cancelar lo vuelve a quitar (trigger)", async () => {
    const o = await newOrder(db, 4);
    expect(await tshirt()).toBe(6);
    await asUser(db, ids.alice, () => db.query("update orders set status='cancelado' where id=$1", [o]));
    expect(await tshirt()).toBe(10);
    expect((await q("select reason from stock_movements where order_id=$1 order by created_at desc limit 1", [o])).rows[0].reason).toBe("Pedido cancelado");
    await asUser(db, ids.alice, () => db.query("update orders set status='sin_hacer' where id=$1", [o]));
    expect(await tshirt()).toBe(6);
    // Borrarlo devuelve el stock y el historial se conserva (sin vínculo al pedido).
    await asUser(db, ids.alice, () => db.query("delete from orders where id=$1", [o]));
    expect(await tshirt()).toBe(10);
    expect((await q("select count(*)::int n from stock_movements where order_label='Pedido #A1' and reason='Pedido borrado' and order_id is null")).rows[0].n).toBeGreaterThan(0);
  });

  it("sin stock suficiente se crea igual y queda en negativo (para avisar y crear «Pedir …»)", async () => {
    const o = await newOrder(db, 13);
    expect(await tshirt()).toBe(-3);
    const r = await asUser(db, ids.alice, async () => {
      await db.query("update order_items set quantity=14, stock_effects=$2 where order_id=$1", [o, effects("tshirt|Negra|M", 14)]);
      return (await db.query("select * from apply_order_stock($1)", [o])).rows;
    });
    expect(r).toEqual([{ item_key: "tshirt|Negra|M", label: "Camiseta negra M", delta: -1, quantity: -4 }]);
    await q("delete from orders where id=$1", [o]);
    expect(await tshirt()).toBe(10);
  });

  it("los pedidos sin vincular (anteriores o texto libre) no descuentan", async () => {
    const o = (await q("insert into orders (workspace_id,user_id,business_id) values ($1,$2,$3) returning id", [ids.ws, ids.alice, ids.biz])).rows[0].id;
    await q("insert into order_items (workspace_id,user_id,order_id,product_name,quantity) values ($1,$2,$3,'Camiseta negra M',2)", [ids.ws, ids.alice, o]);
    await asUser(db, ids.alice, () => db.query("select * from apply_order_stock($1)", [o]));
    await asUser(db, ids.alice, () => db.query("update orders set status='cancelado' where id=$1", [o]));
    expect(await tshirt()).toBe(10);
    expect((await q("select count(*)::int n from stock_movements where order_id=$1", [o])).rows[0].n).toBe(0);
    await q("delete from orders where id=$1", [o]);
  });

  it("dos pedidos a la vez sobre el mismo artículo descuentan los dos, sin perder ninguno", async () => {
    const c1 = new Client({ connectionString: url }), c2 = new Client({ connectionString: url });
    await Promise.all([c1.connect(), c2.connect()]);
    try {
      const made = await Promise.all(Array.from({ length: 6 }, (_, i) => newOrder(i % 2 ? c1 : c2, 1)));
      expect(made).toHaveLength(6);
      expect(await tshirt()).toBe(4);
      // El mismo pedido aplicado a la vez desde dos conexiones: se descuenta una sola vez.
      const o = made[0];
      await asUser(db, ids.alice, () => db.query("update order_items set quantity=3, stock_effects=$2 where order_id=$1", [o, effects("tshirt|Negra|M", 3)]));
      await Promise.all([c1, c2].map((c) => asUser(c, ids.alice, () => c.query("select * from apply_order_stock($1)", [o]))));
      expect(await tshirt()).toBe(2);
      for (const id of made) await q("delete from orders where id=$1", [id]);
      expect(await tshirt()).toBe(10);
    } finally { await Promise.all([c1.end(), c2.end()]); }
  });

  it("otro espacio no puede mover el stock ajeno con un pedido", async () => {
    const o = await newOrder(db, 1);
    const r = await asUser(db, ids.bob, () => db.query("select * from apply_order_stock($1)", [o]));
    expect(r.rows).toEqual([]);
    expect(await tshirt()).toBe(9);
    await q("delete from orders where id=$1", [o]);
  });

  it("borrar el negocio entero no falla (no hay nada que devolver)", async () => {
    await newOrder(db, 2);
    await q("delete from businesses where id=$1", [ids.biz]);
    expect((await q("select count(*)::int n from orders where business_id=$1", [ids.biz])).rows[0].n).toBe(0);
  });
});

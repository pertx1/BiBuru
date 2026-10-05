import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Necesita `npm run test:db` (base con migraciones). Sin DATABASE_TEST_URL se omite.
const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

d("Negocios, pedidos, gastos: permisos y cálculos", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", aliceWs: "", bobWs: "", aliceBiz: "", bobBiz: "", cat: "" };

  async function asUser<T>(uid: string, fn: (c: Client) => Promise<T>) {
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      return await fn(db);
    } finally {
      await db.query("rollback");
    }
  }
  /** Como postgres (sin RLS): para preparar datos. */
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);

  beforeAll(async () => {
    await db.connect();
    await q("truncate auth.users cascade");
    ids.alice = (await q("insert into auth.users (email) values ('a@x.com') returning id")).rows[0].id;
    ids.bob = (await q("insert into auth.users (email) values ('b@x.com') returning id")).rows[0].id;
    ids.aliceWs = (await q("select id from workspaces where owner_id=$1", [ids.alice])).rows[0].id;
    ids.bobWs = (await q("select id from workspaces where owner_id=$1", [ids.bob])).rows[0].id;
    ids.aliceBiz = (await q("insert into businesses (workspace_id,user_id,name) values ($1,$2,'Akerra') returning id", [ids.aliceWs, ids.alice])).rows[0].id;
    ids.bobBiz = (await q("insert into businesses (workspace_id,user_id,name) values ($1,$2,'Otro') returning id", [ids.bobWs, ids.bob])).rows[0].id;
    ids.cat = (await q("select id from expense_categories where workspace_id=$1 and name='Envíos'", [ids.aliceWs])).rows[0].id;
  });
  afterAll(async () => {
    await db.end();
  });

  it("el alta de usuario crea categorías de gasto por defecto", async () => {
    const r = await q("select count(*)::int n from expense_categories where workspace_id=$1", [ids.aliceWs]);
    expect(r.rows[0].n).toBe(7);
  });

  it("un usuario no ve negocios, pedidos ni gastos de otro", async () => {
    await q(
      `insert into orders (workspace_id,user_id,business_id,order_date) values ($1,$2,$3,'2026-01-10')`,
      [ids.bobWs, ids.bob, ids.bobBiz],
    );
    await q(
      `insert into expenses (workspace_id,user_id,business_id,amount_cents,expense_date) values ($1,$2,$3,500,'2026-01-10')`,
      [ids.bobWs, ids.bob, ids.bobBiz],
    );
    for (const table of ["businesses", "orders", "expenses", "incomes", "products", "order_items", "expense_categories"]) {
      const r = await asUser(ids.alice, (c) => c.query(`select workspace_id from ${table}`));
      expect(r.rows.every((row) => row.workspace_id === ids.aliceWs), table).toBe(true);
    }
  });

  it("no se puede insertar en el workspace de otro usuario", async () => {
    await expect(
      asUser(ids.alice, (c) =>
        c.query(
          "insert into businesses (workspace_id,user_id,name) values ($1,$2,'intruso')",
          [ids.bobWs, ids.alice],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("no se puede suplantar a otro usuario como autor", async () => {
    await expect(
      asUser(ids.alice, (c) =>
        c.query("insert into businesses (workspace_id,user_id,name) values ($1,$2,'x')", [ids.aliceWs, ids.bob]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("no se puede colgar un pedido de un negocio de otro workspace (FK compuesta)", async () => {
    await expect(
      q(`insert into orders (workspace_id,user_id,business_id) values ($1,$2,$3)`, [ids.aliceWs, ids.alice, ids.bobBiz]),
    ).rejects.toThrow(/foreign key/);
  });

  it("no se puede editar ni borrar datos de otro", async () => {
    const u = await asUser(ids.alice, (c) => c.query("update businesses set name='x' where id=$1", [ids.bobBiz]));
    expect(u.rowCount).toBe(0);
    const del = await asUser(ids.alice, (c) => c.query("delete from expenses where workspace_id=$1", [ids.bobWs]));
    expect(del.rowCount).toBe(0);
  });

  it("los totales del pedido se calculan solos con las líneas", async () => {
    const o = (await q(
      `insert into orders (workspace_id,user_id,business_id,order_date) values ($1,$2,$3,'2026-02-03') returning id`,
      [ids.aliceWs, ids.alice, ids.aliceBiz],
    )).rows[0].id;
    await q(
      `insert into order_items (workspace_id,user_id,order_id,product_name,quantity,unit_price_cents,unit_cost_cents)
       values ($1,$2,$3,'Camiseta',2,2500,900),($1,$2,$3,'Sudadera',1,4000,1500)`,
      [ids.aliceWs, ids.alice, o],
    );
    let r = (await q("select total_cents, cost_cents from orders where id=$1", [o])).rows[0];
    expect([r.total_cents, r.cost_cents]).toEqual(["9000", "3300"]);
    await q("delete from order_items where order_id=$1 and product_name='Sudadera'", [o]);
    r = (await q("select total_cents, cost_cents from orders where id=$1", [o])).rows[0];
    expect([r.total_cents, r.cost_cents]).toEqual(["5000", "1800"]);
  });

  it("las estadísticas excluyen cancelados, suman ingresos sueltos y restan gastos", async () => {
    await q("delete from orders where workspace_id=$1", [ids.aliceWs]);
    await q("delete from expenses where workspace_id=$1", [ids.aliceWs]);
    const mk = async (status: string, date: string, price: number, qty = 1) => {
      const o = (await q(
        `insert into orders (workspace_id,user_id,business_id,order_date,status) values ($1,$2,$3,$4,$5) returning id`,
        [ids.aliceWs, ids.alice, ids.aliceBiz, date, status],
      )).rows[0].id;
      await q(
        `insert into order_items (workspace_id,user_id,order_id,product_name,color,size,quantity,unit_price_cents)
         values ($1,$2,$3,'Camiseta','Negra','M',$4,$5)`,
        [ids.aliceWs, ids.alice, o, qty, price],
      );
    };
    await mk("enviado", "2026-03-05", 2500, 2); // 5000
    await mk("sin_hacer", "2026-03-20", 3000); // 3000
    await mk("cancelado", "2026-03-21", 9999); // excluido
    await mk("enviado", "2026-02-10", 1000); // otro mes
    await q(`insert into incomes (workspace_id,user_id,business_id,income_date,source,amount_cents) values ($1,$2,$3,'2026-03-15','Vinted',1234)`, [ids.aliceWs, ids.alice, ids.aliceBiz]);
    await q(`insert into expenses (workspace_id,user_id,business_id,expense_date,amount_cents,category_id) values ($1,$2,$3,'2026-03-02',2000,$4)`, [ids.aliceWs, ids.alice, ids.aliceBiz, ids.cat]);

    const t = await asUser(ids.alice, (c) =>
      c.query("select * from stats_totals($1,'2026-03-01','2026-03-31')", [ids.aliceWs]),
    );
    expect(t.rows).toHaveLength(1);
    expect([t.rows[0].income_cents, t.rows[0].expense_cents, t.rows[0].orders_count]).toEqual(["9234", "2000", "2"]);

    const m = await asUser(ids.alice, (c) =>
      c.query("select * from stats_monthly($1,'2026-02-01','2026-03-31')", [ids.aliceWs]),
    );
    expect(m.rows.map((r) => [r.income_cents, r.expense_cents])).toEqual([["1000", "0"], ["9234", "2000"]]);

    const top = await asUser(ids.alice, (c) =>
      c.query("select * from stats_top_products($1,'2026-03-01','2026-03-31',null,'size')", [ids.aliceWs]),
    );
    expect(top.rows[0]).toMatchObject({ label: "Camiseta · M", units: "3", revenue_cents: "8000" });

    const cats = await asUser(ids.alice, (c) =>
      c.query("select * from stats_expenses_by_category($1,'2026-03-01','2026-03-31')", [ids.aliceWs]),
    );
    expect(cats.rows[0]).toMatchObject({ label: "Envíos", amount_cents: "2000" });
  });

  it("las estadísticas no incluyen datos de otro workspace aunque se pida su id", async () => {
    const t = await asUser(ids.alice, (c) =>
      c.query("select * from stats_totals($1,'2026-01-01','2026-12-31')", [ids.bobWs]),
    );
    expect(t.rows).toHaveLength(0);
  });

  it("los gastos recurrentes se generan una sola vez por periodo (idempotente)", async () => {
    await q("delete from expenses where workspace_id=$1", [ids.aliceWs]);
    const tpl = (await q(
      `insert into expenses (workspace_id,user_id,business_id,expense_date,amount_cents,concept,recurrence)
       values ($1,$2,$3,'2026-01-31',999,'Hosting','monthly') returning id`,
      [ids.aliceWs, ids.alice, ids.aliceBiz],
    )).rows[0].id;
    const run = () => asUser(ids.alice, async (c) => {
      const r = await c.query("select materialize_recurring_expenses($1,'2026-04-30') n", [ids.aliceWs]);
      return r.rows[0].n as number;
    });
    // La función es security invoker y asUser hace rollback: persistimos como postgres.
    const gen = async () => (await q("select materialize_recurring_expenses($1,'2026-04-30') n", [ids.aliceWs])).rows[0].n;
    expect(await gen()).toBe(3); // 28 feb, 31 mar, 30 abr
    expect(await gen()).toBe(0);
    const dates = (await q("select expense_date::text d from expenses where recurring_parent_id=$1 order by 1", [tpl])).rows.map((r) => r.d);
    expect(dates).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
    void run;
  });

  it("borrar un pedido borra sus líneas y no falla el trigger de totales", async () => {
    const o = (await q(
      `insert into orders (workspace_id,user_id,business_id) values ($1,$2,$3) returning id`,
      [ids.aliceWs, ids.alice, ids.aliceBiz],
    )).rows[0].id;
    await q(`insert into order_items (workspace_id,user_id,order_id,product_name,unit_price_cents) values ($1,$2,$3,'X',100)`, [ids.aliceWs, ids.alice, o]);
    const left = await asUser(ids.alice, async (c) => {
      const del = await c.query("delete from orders where id=$1", [o]);
      expect(del.rowCount).toBe(1);
      return (await c.query("select count(*)::int n from order_items where order_id=$1", [o])).rows[0].n;
    });
    expect(left).toBe(0);
  });

  it("un usuario puede borrar su pedido y los totales siguen bien al editar líneas como usuario", async () => {
    const o = (await q(
      `insert into orders (workspace_id,user_id,business_id) values ($1,$2,$3) returning id`,
      [ids.aliceWs, ids.alice, ids.aliceBiz],
    )).rows[0].id;
    const total = await asUser(ids.alice, async (c) => {
      await c.query(
        `insert into order_items (workspace_id,user_id,order_id,product_name,quantity,unit_price_cents) values ($1,$2,$3,'Y',3,1000)`,
        [ids.aliceWs, ids.alice, o],
      );
      return (await c.query("select total_cents from orders where id=$1", [o])).rows[0].total_cents;
    });
    expect(total).toBe("3000");
  });

  it("los tickets (Storage) solo son visibles para miembros del workspace", async () => {
    await q("insert into storage.objects (bucket_id, name) values ('receipts', $1), ('receipts', $2)", [
      `${ids.aliceWs}/${ids.aliceBiz}/a.jpg`, `${ids.bobWs}/${ids.bobBiz}/b.jpg`,
    ]);
    const r = await asUser(ids.alice, (c) => c.query("select name from storage.objects where bucket_id='receipts'"));
    expect(r.rows.map((x) => x.name)).toEqual([`${ids.aliceWs}/${ids.aliceBiz}/a.jpg`]);
    await expect(
      asUser(ids.alice, (c) => c.query("insert into storage.objects (bucket_id, name) values ('receipts', $1)", [`${ids.bobWs}/x/hack.jpg`])),
    ).rejects.toThrow(/row-level security/);
  });
});

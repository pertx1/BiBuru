import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeLayout } from "../src/lib/home/layout";
import { normalizeTabs } from "../src/lib/home/nav";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

d("Inicio: preferencias por usuario y cifras del Resumen financiero", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", aWs: "", bWs: "", ak: "", vi: "" };
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
    [ids.ak, ids.vi] = (await q("insert into businesses (workspace_id,user_id,name) values ($1,$2,'Akerra'),($1,$2,'Vinted') returning id", [ids.aWs, ids.alice])).rows.map((r) => r.id);
    // Pedidos (uno cancelado, que no cuenta), ingresos sueltos y gastos repartidos en varios meses.
    const order = async (biz: string, date: string, cents: number, status = "enviado") => {
      const o = (await q("insert into orders (workspace_id,user_id,business_id,order_date,status) values ($1,$2,$3,$4,$5) returning id", [ids.aWs, ids.alice, biz, date, status])).rows[0].id;
      await q("insert into order_items (workspace_id,user_id,order_id,product_name,quantity,unit_price_cents) values ($1,$2,$3,'Camiseta',1,$4)", [ids.aWs, ids.alice, o, cents]);
    };
    await order(ids.ak, "2026-05-10", 1900); await order(ids.ak, "2026-08-02", 2500); await order(ids.ak, "2026-10-01", 18586);
    await order(ids.vi, "2026-10-03", 1200); await order(ids.ak, "2026-10-04", 99999, "cancelado"); await order(ids.ak, "2025-01-15", 700);
    await q("insert into incomes (workspace_id,user_id,business_id,income_date,source,amount_cents) values ($1,$2,$3,'2026-09-20','Vinted',800)", [ids.aWs, ids.alice, ids.vi]);
    await q("insert into expenses (workspace_id,user_id,business_id,expense_date,concept,amount_cents) values ($1,$2,$3,'2026-10-02','DTF',2500),($1,$2,$3,'2026-06-12','Bolsas',1340),($1,$2,$4,'2026-10-05','Envío',300)", [ids.aWs, ids.alice, ids.ak, ids.vi]);
  });
  afterAll(async () => { await db.end(); });

  it("guardar y cargar la disposición y la barra (vuelven igual tras normalizar)", async () => {
    const layout = [{ id: "w-0001", type: "sales", size: "s", settings: { business: ids.ak } }, { id: "w-0002", type: "finance-summary", size: "l", settings: { business: "all", months: "12" } }];
    const row = await as(ids.alice, async (c) => {
      await c.query("insert into user_ui_prefs (workspace_id, home_widgets, mobile_tabs) values ($1, $2, $3)", [ids.aWs, JSON.stringify(layout), ["notas", "tareas"]]);
      await c.query("update user_ui_prefs set mobile_tabs = $2 where workspace_id = $1", [ids.aWs, ["notas", "tareas", "chat"]]);
      return (await c.query("select user_id, home_widgets, mobile_tabs from user_ui_prefs")).rows;
    });
    expect(row).toHaveLength(1);
    expect(row[0].user_id).toBe(ids.alice);
    expect(normalizeLayout(row[0].home_widgets)).toEqual(layout);
    expect(normalizeTabs(row[0].mobile_tabs)).toEqual(["notas", "tareas", "chat"]);
  });

  it("cada uno solo ve y cambia sus preferencias", async () => {
    await q("insert into user_ui_prefs (user_id, workspace_id, mobile_tabs) values ($1,$2,'{tareas}'),($3,$4,'{notas}')", [ids.alice, ids.aWs, ids.bob, ids.bWs]);
    const seen = await as(ids.alice, (c) => c.query("select mobile_tabs from user_ui_prefs"));
    expect(seen.rows.map((r) => r.mobile_tabs)).toEqual([["tareas"]]);
    expect((await as(ids.alice, (c) => c.query("update user_ui_prefs set mobile_tabs='{chat}' where user_id=$1", [ids.bob]))).rowCount).toBe(0);
    expect((await as(ids.alice, (c) => c.query("delete from user_ui_prefs where user_id=$1", [ids.bob]))).rowCount).toBe(0);
    // No puede crear preferencias a nombre de otro ni en un espacio ajeno.
    await expect(as(ids.alice, (c) => c.query("insert into user_ui_prefs (user_id, workspace_id) values ($1,$2)", [ids.bob, ids.bWs]))).rejects.toThrow();
    await expect(as(ids.bob, (c) => c.query("insert into user_ui_prefs (workspace_id) values ($1)", [ids.aWs]))).rejects.toThrow();
    // Límites de tamaño.
    await expect(q("update user_ui_prefs set mobile_tabs='{a,b,c,d,e}' where user_id=$1", [ids.alice])).rejects.toThrow();
    await expect(q("update user_ui_prefs set home_widgets='{\"no\":\"lista\"}' where user_id=$1", [ids.alice])).rejects.toThrow();
    await q("delete from user_ui_prefs");
  });

  it("totales del Resumen financiero = los de Estadísticas (stats_totals), y la serie mensual suma lo mismo", async () => {
    const all = await as(ids.alice, (c) => c.query("select sum(income_cents)::int inc, sum(expense_cents)::int exp from stats_totals($1,'1900-01-01','2999-12-31')", [ids.aWs]));
    expect(all.rows[0]).toEqual({ inc: 1900 + 2500 + 18586 + 1200 + 700 + 800, exp: 2500 + 1340 + 300 });
    const month = await as(ids.alice, (c) => c.query("select sum(income_cents)::int inc, sum(expense_cents)::int exp from stats_totals($1,'2026-10-01','2026-10-31')", [ids.aWs]));
    expect(month.rows[0]).toEqual({ inc: 18586 + 1200, exp: 2800 });
    const ak = await as(ids.alice, (c) => c.query("select income_cents::int inc, expense_cents::int exp from stats_totals($1,'1900-01-01','2999-12-31',$2)", [ids.aWs, ids.ak]));
    expect(ak.rows[0]).toEqual({ inc: 1900 + 2500 + 18586 + 700, exp: 3840 });
    // Gráfico de 6 meses (may–oct 2026): la suma de la serie = el total de ese tramo.
    const series = await as(ids.alice, (c) => c.query("select month::text, income_cents::int inc, expense_cents::int exp from stats_monthly($1,'2026-05-01','2026-10-31')", [ids.aWs]));
    expect(series.rows.map((r) => r.month)).toEqual(["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"]);
    const tramo = await as(ids.alice, (c) => c.query("select sum(income_cents)::int inc, sum(expense_cents)::int exp from stats_totals($1,'2026-05-01','2026-10-31')", [ids.aWs]));
    expect({ inc: series.rows.reduce((s, r) => s + r.inc, 0), exp: series.rows.reduce((s, r) => s + r.exp, 0) }).toEqual(tramo.rows[0]);
  });

  it("serie diaria: un punto por día y la misma suma que los totales; otro usuario no ve nada", async () => {
    const days = await as(ids.alice, (c) => c.query("select day::text, income_cents::int inc, expense_cents::int exp, orders_count::int n from stats_daily($1,'2026-09-30','2026-10-06')", [ids.aWs]));
    expect(days.rows).toHaveLength(7);
    expect(days.rows.find((r) => r.day === "2026-10-04")).toEqual({ day: "2026-10-04", inc: 0, exp: 0, n: 0 }); // el cancelado no cuenta
    const tot = await as(ids.alice, (c) => c.query("select sum(income_cents)::int inc, sum(expense_cents)::int exp from stats_totals($1,'2026-09-30','2026-10-06')", [ids.aWs]));
    expect({ inc: days.rows.reduce((s, r) => s + r.inc, 0), exp: days.rows.reduce((s, r) => s + r.exp, 0) }).toEqual(tot.rows[0]);
    const bob = await as(ids.bob, (c) => c.query("select sum(income_cents)::int inc from stats_daily($1,'2026-09-30','2026-10-06')", [ids.aWs]));
    expect(bob.rows[0].inc).toBe(0);
  });
});

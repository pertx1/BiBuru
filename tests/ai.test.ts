import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

d("IA: consumo, precios y chat", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", aWs: "", bWs: "" };
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
    for (const [ws, u] of [[ids.aWs, ids.alice], [ids.bWs, ids.bob]]) {
      await q("insert into ai_usage (workspace_id,user_id,feature,model,input_tokens,output_tokens,cost_micros) values ($1,$2,'chat','m',1000,200,5000),($1,$2,'chat','m',500,100,2500),($1,$2,'video','v',100000,2000,40000)", [ws, u]);
      await q("insert into chat_messages (workspace_id,user_id,conversation_id,role,content) values ($1,$2,gen_random_uuid(),'user','hola')", [ws, u]);
    }
    await q("insert into ai_usage (workspace_id,user_id,feature,model,cost_micros,created_at) values ($1,$2,'chat','m',999999, now() - interval '40 days')", [ids.aWs, ids.alice]);
  });
  afterAll(async () => { await db.end(); });

  it.each(["ai_usage", "ai_prices", "chat_messages"])("%s: aislamiento entre usuarios", async (t) => {
    const r = await as(ids.alice, (c) => c.query(`select workspace_id from ${t}`));
    expect(r.rows.every((x) => x.workspace_id === ids.aWs)).toBe(true);
  });

  it("ai_spend agrupa por función y respeta el rango de fechas", async () => {
    const r = await as(ids.alice, (c) => c.query("select * from ai_spend($1, now() - interval '30 days', now() + interval '1 day') order by feature", [ids.aWs]));
    expect(r.rows.map((x) => [x.feature, x.calls, x.cost_micros])).toEqual([["chat", "2", "7500"], ["video", "1", "40000"]]);
  });

  it("ai_spend no deja ver el consumo de otro workspace", async () => {
    const r = await as(ids.alice, (c) => c.query("select * from ai_spend($1, now() - interval '30 days')", [ids.bWs]));
    expect(r.rowCount).toBe(0);
  });

  it("ai_recent_calls cuenta las llamadas del último minuto", async () => {
    const r = await as(ids.alice, (c) => c.query("select ai_recent_calls($1, 60) n", [ids.aWs]));
    expect(r.rows[0].n).toBe("3");
  });

  it("restricciones: función desconocida, costes y precios negativos", async () => {
    await expect(q("insert into ai_usage (workspace_id,user_id,feature,model) values ($1,$2,'magia','m')", [ids.aWs, ids.alice])).rejects.toThrow(/check/);
    await expect(q("insert into ai_usage (workspace_id,user_id,feature,model,cost_micros) values ($1,$2,'chat','m',-1)", [ids.aWs, ids.alice])).rejects.toThrow(/check/);
    await expect(q("insert into ai_prices (workspace_id,user_id,model,input_eur_per_mtok,output_eur_per_mtok) values ($1,$2,'m',-1,1)", [ids.aWs, ids.alice])).rejects.toThrow(/check/);
  });

  it("un usuario no puede falsear el consumo de otro workspace", async () => {
    await expect(as(ids.alice, (c) => c.query("insert into ai_usage (workspace_id,user_id,feature,model) values ($1,$2,'chat','m')", [ids.bWs, ids.alice]))).rejects.toThrow(/row-level/);
  });

  it("valores por defecto: presupuesto de 10 € y aplicar automáticamente desactivado", async () => {
    const r = (await q("select ai_monthly_budget_cents, ai_auto_apply from profiles where user_id=$1", [ids.alice])).rows[0];
    expect(r).toEqual({ ai_monthly_budget_cents: 1000, ai_auto_apply: false });
  });
});

import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;
const sql = readFileSync("supabase/migrations/20261109000001_akerra_hoodies.sql", "utf8");

/** Migración de Akerra: crea las sudaderas gris/negra/blanca que falten y pone Eguzkilore en «Sudadera» (del color del pedido). */
d("sudaderas de Akerra", () => {
  const db = new Client({ connectionString: url });
  const q = (s: string, p: unknown[] = []) => db.query(s, p);
  let ak = "", other = "";
  beforeAll(async () => {
    await db.connect();
    await q("truncate auth.users cascade");
    const u = (await q("insert into auth.users (email) values ('a@x.com') returning id")).rows[0].id;
    const ws = (await q("select id from workspaces where owner_id=$1", [u])).rows[0].id;
    [ak, other] = (await q("insert into businesses (workspace_id,user_id,name) values ($1,$2,'Akerra'),($1,$2,'Otro') returning id", [ws, u])).rows.map((r) => r.id);
    for (const b of [ak, other]) {
      await q("insert into tshirt_stocks (workspace_id,user_id,business_id,model,size,quantity) values ($1,$2,$3,'Sudadera negra','M',7),($1,$2,$3,'Sudadera negra','L',3),($1,$2,$3,'Sudadera Gris','M',2)", [ws, u, b]);
      await q("insert into dtf_designs (workspace_id,user_id,business_id,name,kind,garment_model) values ($1,$2,$3,'Eguzkilore','standalone','Sudadera negra'),($1,$2,$3,'Gatazka Sudadera','standalone','Sudadera negra')", [ws, u, b]);
    }
    await q(sql);
    await q(sql); // se puede repetir sin duplicar
  });
  afterAll(async () => { await db.end(); });

  it("añade las que faltan con las tallas de las que hay, a 0, sin tocar las cantidades", async () => {
    const rows = (await q("select model, size, quantity from tshirt_stocks where business_id=$1 order by lower(model), size", [ak])).rows;
    expect(rows).toEqual([
      { model: "Sudadera blanca", size: "L", quantity: 0 }, { model: "Sudadera blanca", size: "M", quantity: 0 },
      { model: "Sudadera Gris", size: "L", quantity: 0 }, { model: "Sudadera Gris", size: "M", quantity: 2 },
      { model: "Sudadera negra", size: "L", quantity: 3 }, { model: "Sudadera negra", size: "M", quantity: 7 },
    ]);
  });
  it("Eguzkilore pasa a «Sudadera»; Gatazka sigue en la negra; otros negocios no cambian", async () => {
    const g = async (b: string) => Object.fromEntries((await q("select name, garment_model from dtf_designs where business_id=$1", [b])).rows.map((r) => [r.name, r.garment_model]));
    expect(await g(ak)).toEqual({ Eguzkilore: "Sudadera", "Gatazka Sudadera": "Sudadera negra" });
    expect(await g(other)).toEqual({ Eguzkilore: "Sudadera negra", "Gatazka Sudadera": "Sudadera negra" });
    expect((await q("select count(*)::int n from tshirt_stocks where business_id=$1", [other])).rows[0].n).toBe(3);
  });
});

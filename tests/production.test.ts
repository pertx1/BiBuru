import { createHash } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

d("Producción: permisos y conexión con Antola", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", aliceWs: "", bobWs: "", aliceBiz: "", bobBiz: "" };
  const TOKEN = "pf_" + "a".repeat(43);

  async function as<T>(uid: string | null, fn: (c: Client) => Promise<T>) {
    await db.query("begin");
    try {
      await db.query(uid ? "set local role authenticated" : "set local role anon");
      if (uid) await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
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
    ids.aliceWs = (await q("select id from workspaces where owner_id=$1", [ids.alice])).rows[0].id;
    ids.bobWs = (await q("select id from workspaces where owner_id=$1", [ids.bob])).rows[0].id;
    ids.aliceBiz = (await q("insert into businesses (workspace_id,user_id,name,production_enabled) values ($1,$2,'Akerra',true) returning id", [ids.aliceWs, ids.alice])).rows[0].id;
    ids.bobBiz = (await q("insert into businesses (workspace_id,user_id,name) values ($1,$2,'Otro') returning id", [ids.bobWs, ids.bob])).rows[0].id;
    for (const [ws, u, b] of [[ids.aliceWs, ids.alice, ids.aliceBiz], [ids.bobWs, ids.bob, ids.bobBiz]]) {
      await q("insert into tshirt_stocks (workspace_id,user_id,business_id,model,size,quantity) values ($1,$2,$3,'Negra','M',5)", [ws, u, b]);
      await q("insert into dtf_designs (workspace_id,user_id,business_id,name,kind) values ($1,$2,$3,'Ujue','paired')", [ws, u, b]);
      await q("insert into invoices (workspace_id,user_id,business_id,name,url) values ($1,$2,$3,'F1','https://x.com/f1')", [ws, u, b]);
    }
    await q("insert into api_tokens (workspace_id,user_id,business_id,kind,token_hash) values ($1,$2,$3,'antola',$4)", [ids.aliceWs, ids.alice, ids.aliceBiz, sha(TOKEN)]);
    const o = (await q("insert into orders (workspace_id,user_id,business_id,status) values ($1,$2,$3,'sin_hacer') returning id", [ids.aliceWs, ids.alice, ids.aliceBiz])).rows[0].id;
    await q("insert into order_items (workspace_id,user_id,order_id,product_name,color,size,quantity,unit_price_cents) values ($1,$2,$3,'Ujue','Negra','M',2,2500)", [ids.aliceWs, ids.alice, o]);
    const o2 = (await q("insert into orders (workspace_id,user_id,business_id,status) values ($1,$2,$3,'enviado') returning id", [ids.aliceWs, ids.alice, ids.aliceBiz])).rows[0].id;
    await q("insert into order_items (workspace_id,user_id,order_id,product_name,quantity) values ($1,$2,$3,'Ya enviado',1)", [ids.aliceWs, ids.alice, o2]);
  });
  afterAll(async () => { await db.end(); });

  it.each(["tshirt_stocks", "dtf_designs", "invoices", "api_tokens"])("%s: cada usuario solo ve lo suyo", async (t) => {
    const r = await as(ids.alice, (c) => c.query(`select workspace_id from ${t}`));
    expect(r.rows.every((x) => x.workspace_id === ids.aliceWs)).toBe(true);
  });

  it("no se puede escribir stock en un negocio de otro workspace", async () => {
    await expect(as(ids.alice, (c) => c.query("insert into tshirt_stocks (workspace_id,user_id,business_id,model,size) values ($1,$2,$3,'X','S')", [ids.aliceWs, ids.alice, ids.bobBiz]))).rejects.toThrow(/foreign key|row-level/);
    await expect(as(ids.alice, (c) => c.query("insert into tshirt_stocks (workspace_id,user_id,business_id,model,size) values ($1,$2,$3,'X','S')", [ids.bobWs, ids.alice, ids.bobBiz]))).rejects.toThrow(/row-level/);
  });

  it("el stock no admite duplicados por modelo y talla", async () => {
    await expect(q("insert into tshirt_stocks (workspace_id,user_id,business_id,model,size) values ($1,$2,$3,'Negra','M')", [ids.aliceWs, ids.alice, ids.aliceBiz])).rejects.toThrow(/unique|duplicate/);
  });

  it("las facturas solo aceptan enlaces http(s)", async () => {
    await expect(q("insert into invoices (workspace_id,user_id,business_id,name,url) values ($1,$2,$3,'x','javascript:alert(1)')", [ids.aliceWs, ids.alice, ids.aliceBiz])).rejects.toThrow(/check/);
  });

  it("antola_snapshot: sin clave o con clave falsa no devuelve nada", async () => {
    for (const hash of [sha("otra"), "", "x"]) {
      const r = await as(null, (c) => c.query("select public.antola_snapshot($1) s", [hash]));
      expect(r.rows[0].s).toBeNull();
    }
  });

  it("antola_snapshot: con clave válida devuelve solo los datos de ese negocio y los pedidos pendientes", async () => {
    const r = await as(null, (c) => c.query("select public.antola_snapshot($1) s", [sha(TOKEN)]));
    const s = r.rows[0].s;
    expect(s.tshirt_stocks).toEqual([{ model: "Negra", size: "M", quantity: 5 }]);
    expect(s.designs).toEqual([{ name: "Ujue", kind: "paired" }]);
    expect(s.pending_items).toEqual([{ product_name: "Ujue", color: "Negra", size: "M", quantity: 2 }]); // el enviado no cuenta
    expect(JSON.stringify(s)).not.toContain(ids.bobBiz);
  });

  it("un anónimo no puede leer las tablas directamente ni las claves guardadas", async () => {
    await expect(as(null, (c) => c.query("select * from api_tokens"))).rejects.toThrow(/permission denied/);
    await expect(as(null, (c) => c.query("select * from tshirt_stocks"))).rejects.toThrow(/permission denied/);
  });

  it("no se puede usar la clave de otro negocio: una sola clave por negocio y tipo", async () => {
    await expect(q("insert into api_tokens (workspace_id,user_id,business_id,kind,token_hash) values ($1,$2,$3,'antola',$4)", [ids.aliceWs, ids.alice, ids.aliceBiz, sha("otra")])).rejects.toThrow(/unique|duplicate/);
  });
});

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_TEST_URL;
const d = url ? describe : describe.skip;

d("Avisos: permisos e idempotencia", () => {
  const db = new Client({ connectionString: url });
  const ids = { alice: "", bob: "", carol: "", aWs: "", bWs: "" };

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
  const ep = (n: string) => `https://push.example.com/send/${n}`;

  beforeAll(async () => {
    await db.connect();
    await q("truncate auth.users cascade");
    ids.alice = (await q("insert into auth.users (email) values ('a@x.com') returning id")).rows[0].id;
    ids.bob = (await q("insert into auth.users (email) values ('b@x.com') returning id")).rows[0].id;
    ids.carol = (await q("insert into auth.users (email) values ('c@x.com') returning id")).rows[0].id; // comparte workspace con Alice
    ids.aWs = (await q("select id from workspaces where owner_id=$1", [ids.alice])).rows[0].id;
    ids.bWs = (await q("select id from workspaces where owner_id=$1", [ids.bob])).rows[0].id;
    await q("insert into workspace_members (workspace_id,user_id,role) values ($1,$2,'member')", [ids.aWs, ids.carol]);
    const key = "B".repeat(87);
    await q("insert into push_subscriptions (workspace_id,user_id,endpoint,p256dh,auth) values ($1,$2,$3,$4,'abcdefghijklmnopqrstuv')", [ids.aWs, ids.alice, ep("alice"), key]);
    await q("insert into push_subscriptions (workspace_id,user_id,endpoint,p256dh,auth) values ($1,$2,$3,$4,'abcdefghijklmnopqrstuv')", [ids.bWs, ids.bob, ep("bob"), key]);
  });
  afterAll(async () => { await db.end(); });

  it("las suscripciones push son personales: ni otro usuario ni un compañero del workspace las ven", async () => {
    expect((await as(ids.alice, (c) => c.query("select endpoint from push_subscriptions"))).rows.map((r) => r.endpoint)).toEqual([ep("alice")]);
    expect((await as(ids.carol, (c) => c.query("select endpoint from push_subscriptions"))).rowCount).toBe(0);
    expect((await as(ids.bob, (c) => c.query("select endpoint from push_subscriptions"))).rows.map((r) => r.endpoint)).toEqual([ep("bob")]);
  });

  it("no se puede registrar un dispositivo a nombre de otro ni en un workspace ajeno", async () => {
    await expect(as(ids.alice, (c) => c.query("insert into push_subscriptions (workspace_id,user_id,endpoint,p256dh,auth) values ($1,$2,$3,$4,'abcdefghijklmnopqrstuv')", [ids.aWs, ids.bob, ep("x"), "B".repeat(87)]))).rejects.toThrow(/row-level/);
    await expect(as(ids.alice, (c) => c.query("insert into push_subscriptions (workspace_id,user_id,endpoint,p256dh,auth) values ($1,$2,$3,$4,'abcdefghijklmnopqrstuv')", [ids.bWs, ids.alice, ep("y"), "B".repeat(87)]))).rejects.toThrow(/row-level/);
  });

  it("solo se aceptan endpoints https y la misma suscripción no se duplica", async () => {
    await expect(q("insert into push_subscriptions (workspace_id,user_id,endpoint,p256dh,auth) values ($1,$2,'http://evil.test/x',$3,'abcdefghijklmnopqrstuv')", [ids.aWs, ids.alice, "B".repeat(87)])).rejects.toThrow(/check/);
    await expect(q("insert into push_subscriptions (workspace_id,user_id,endpoint,p256dh,auth) values ($1,$2,$3,$4,'abcdefghijklmnopqrstuv')", [ids.aWs, ids.alice, ep("alice"), "B".repeat(87)])).rejects.toThrow(/unique|duplicate/);
  });

  it("el registro de avisos no es accesible para usuarios", async () => {
    await expect(as(ids.alice, (c) => c.query("select * from notification_log"))).rejects.toThrow(/permission denied/);
    await expect(as(ids.alice, (c) => c.query("insert into notification_log (user_id,dedupe_key,kind) values ($1,'k','task')", [ids.alice]))).rejects.toThrow(/permission denied/);
  });

  it("notification_log: reclamar un aviso dos veces solo funciona la primera (idempotente)", async () => {
    const claim = () => q("insert into notification_log (user_id,dedupe_key,kind) values ($1,'task:1:2026-10-05T10:00','task') on conflict (user_id,dedupe_key) do nothing returning id", [ids.alice]);
    expect((await claim()).rowCount).toBe(1);
    expect((await claim()).rowCount).toBe(0);
    // otro usuario sí puede tener la misma clave
    expect((await q("insert into notification_log (user_id,dedupe_key,kind) values ($1,'task:1:2026-10-05T10:00','task') on conflict do nothing returning id", [ids.bob])).rowCount).toBe(1);
  });

  it("recordatorios: aislados por workspace y ligados a tareas del mismo workspace", async () => {
    const t = (await q("insert into tasks (workspace_id,user_id,title) values ($1,$2,'t') returning id", [ids.bWs, ids.bob])).rows[0].id;
    await expect(q("insert into reminders (workspace_id,user_id,title,remind_at,task_id) values ($1,$2,'r',now(),$3)", [ids.aWs, ids.alice, t])).rejects.toThrow(/foreign key/);
    await q("insert into reminders (workspace_id,user_id,title,remind_at) values ($1,$2,'Pedir presupuesto',now())", [ids.aWs, ids.alice]);
    expect((await as(ids.bob, (c) => c.query("select * from reminders"))).rowCount).toBe(0);
    await expect(q("insert into reminders (workspace_id,user_id,title,remind_at,status) values ($1,$2,'x',now(),'raro')", [ids.aWs, ids.alice])).rejects.toThrow(/check/);
  });

  it("configure_cron no es ejecutable por usuarios y valida sus argumentos", async () => {
    await expect(as(ids.alice, (c) => c.query("select public.configure_cron('https://x.com', $1)", ["s".repeat(30)]))).rejects.toThrow(/permission denied/);
    await expect(q("select public.configure_cron('http://x.com', $1)", ["s".repeat(30)])).rejects.toThrow(/https/);
    await expect(q("select public.configure_cron('https://x.com', 'corto')")).rejects.toThrow(/20 caracteres/);
  });

  it("valores por defecto de las preferencias de avisos", async () => {
    const r = (await q("select task_lead_minutes, event_lead_minutes, daily_digest_enabled, overdue_alert_time::text t, quiet_hours_start::text qs from profiles where user_id=$1", [ids.alice])).rows[0];
    expect(r).toEqual({ task_lead_minutes: 0, event_lead_minutes: 30, daily_digest_enabled: true, t: "17:00:00", qs: "22:00:00" });
  });
});

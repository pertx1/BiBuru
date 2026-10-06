// Aplica las migraciones pendientes de supabase/migrations al desplegar en Vercel (solo producción) y programa el cron.
// Lleva un registro en el esquema privado `biburu_meta` (no expuesto por la API), así que es seguro repetirlo.
// Si una migración falla, el despliegue falla y la versión anterior sigue funcionando (nada a medias: cada archivo va en una transacción).
// Uso local: DATABASE_URL=postgres://… node scripts/migrate.mjs --force
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const force = process.argv.includes("--force");
if (!force && process.env.VERCEL_ENV !== "production") {
  console.log(`[migrate] Omitido (entorno: ${process.env.VERCEL_ENV ?? "local"}). Solo se migra en producción.`);
  process.exit(0);
}
const raw = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!raw) {
  console.log("[migrate] Sin cadena de conexión (POSTGRES_URL_NON_POOLING / DATABASE_URL): migraciones omitidas.");
  process.exit(0);
}
// Supabase usa certificados propios: conexión cifrada sin validar la cadena (igual que su cliente por defecto).
const url = new URL(raw);
const local = ["localhost", "127.0.0.1"].includes(url.hostname);
url.searchParams.delete("sslmode");
url.searchParams.delete("supa");
const client = new pg.Client({ connectionString: url.toString(), ssl: local ? false : { rejectUnauthorized: false } });

const dir = path.resolve("supabase/migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

await client.connect();
try {
  await client.query("select pg_advisory_lock(727274)"); // un solo despliegue migra a la vez
  await client.query("create schema if not exists biburu_meta");
  await client.query("revoke all on schema biburu_meta from public");
  await client.query("create table if not exists biburu_meta.migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await client.query("select name from biburu_meta.migrations")).rows.map((r) => r.name));

  // Base que ya tenía las migraciones aplicadas a mano (sin registro): no se repiten.
  if (done.size === 0) {
    const { rows } = await client.query("select to_regclass('public.profiles') is not null as has_base");
    if (rows[0].has_base) {
      console.error("[migrate] La base ya tiene tablas pero no registro de migraciones: se aplicaron a mano. No toco nada.");
      console.error("[migrate] Para continuar, registra en biburu_meta.migrations los archivos ya aplicados.");
      process.exit(1);
    }
  }

  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(path.join(dir, f), "utf8");
    process.stdout.write(`[migrate] ${f} … `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into biburu_meta.migrations (name) values ($1)", [f]);
      await client.query("commit");
      applied++;
      console.log("ok");
    } catch (e) {
      await client.query("rollback").catch(() => {});
      console.log("ERROR");
      console.error(`[migrate] Falló ${f}: ${e.message}`);
      process.exit(1);
    }
  }
  console.log(`[migrate] ${applied} migraciones nuevas, ${files.length - applied} ya estaban.`);

  // Cron: programa (o reprograma) las llamadas periódicas con el dominio de producción y el secreto.
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const secret = process.env.CRON_SECRET;
  if (host && secret && secret.length >= 20) {
    try {
      const r = await client.query("select public.configure_cron($1, $2) as msg", [`https://${host}`, secret]);
      console.log(`[migrate] Cron: ${r.rows[0].msg}`);
    } catch (e) {
      console.warn(`[migrate] No se pudo programar el cron (¿pg_cron/pg_net desactivados?): ${e.message}`);
    }
  } else {
    console.log("[migrate] Cron sin programar: falta CRON_SECRET o el dominio de producción.");
  }
  await client.query("notify pgrst, 'reload schema'"); // que la API vea las tablas nuevas al instante
} finally {
  await client.end();
}

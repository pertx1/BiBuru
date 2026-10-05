# Pruebas manuales de extremo a extremo (sin Supabase real)

Levantan un "mini Supabase" local: Postgres con las migraciones + PostgREST + un servidor falso de auth.
Sirven para ver la app funcionando de verdad antes de desplegar. No forman parte de CI.

1. `npm run test:db` (deja la base `biburu_test` con migraciones) y crea un usuario en `auth.users`.
2. Descarga PostgREST (https://github.com/PostgREST/postgrest/releases) y arráncalo con un `.conf` con
   `db-uri` (rol `authenticator`), `db-schemas = "public"`, `db-anon-role = "anon"`, `jwt-secret` de 32+ caracteres y `server-port = 3001`.
3. `node scripts/e2e/mock-supabase.mjs` (escucha en 54321).
4. `npm run build && npm start` con `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321`.
5. `USER_ID=<uuid del usuario> node scripts/e2e/browser-flow.mjs` recorre: crear negocio, pedido, gasto, ingreso, estadísticas y CSV.

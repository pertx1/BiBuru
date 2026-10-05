#!/usr/bin/env bash
# Levanta el "mini Supabase" local (Postgres + PostgREST + mock de auth) y la app en producción.
# Requisitos: Postgres local y PostgREST en /tmp/pgrst/postgrest (ver README). Uso: bash scripts/e2e/up.sh
set -euo pipefail
export PGPASSWORD=postgres
if [ -z "${KEEP_DB:-}" ]; then bash scripts/db-setup.sh; fi
psql -h localhost -U postgres -d biburu_test -q <<'SQL' >/dev/null
do $$ begin
  if not exists (select from pg_roles where rolname='authenticator') then create role authenticator login password 'postgres' noinherit; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public, auth to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
insert into auth.users (email) values ('yo@example.com') on conflict do nothing;
SQL
USER_ID=$(psql -h localhost -U postgres -d biburu_test -Atc "select id from auth.users where email='yo@example.com'")
cat > /tmp/pgrst.conf <<CONF
db-uri = "postgres://authenticator:postgres@localhost:5432/biburu_test"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "super-secret-jwt-token-with-at-least-32-characters-long"
server-port = 3001
CONF
nohup /tmp/pgrst/postgrest /tmp/pgrst.conf > /tmp/pgrst.log 2>&1 &
MOCK_USERS="[{\"id\":\"$USER_ID\",\"email\":\"yo@example.com\"}]" nohup node scripts/e2e/mock-supabase.mjs > /tmp/mock.log 2>&1 &
export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_dummykeydummykeydummy ALLOWED_EMAILS=yo@example.com
npm run build >/tmp/build.log 2>&1 || { tail -20 /tmp/build.log; exit 1; }
PORT=3100 nohup npm start > /tmp/next.log 2>&1 &
sleep 5
echo "USER_ID=$USER_ID"

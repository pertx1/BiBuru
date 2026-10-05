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
grant execute on all functions in schema public to service_role;
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
# Claves de prueba para el cron y los avisos (el mini Supabase firma con este secreto JWT).
export SUPABASE_SERVICE_ROLE_KEY=$(node -e '
const c=require("node:crypto");const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const h=b({alg:"HS256",typ:"JWT"}),p=b({role:"service_role",exp:Math.floor(Date.now()/1000)+86400});
console.log(h+"."+p+"."+c.createHmac("sha256","super-secret-jwt-token-with-at-least-32-characters-long").update(h+"."+p).digest("base64url"))')
export CRON_SECRET=test-cron-secret-0123456789abcdef
[ -f /tmp/vapid.env ] || node -e '
const w=require("web-push");const k=w.generateVAPIDKeys();
console.log("NEXT_PUBLIC_VAPID_PUBLIC_KEY="+k.publicKey+"\nVAPID_PRIVATE_KEY="+k.privateKey+"\nVAPID_SUBJECT=mailto:test@example.com")' > /tmp/vapid.env
set -a; . /tmp/vapid.env; set +a
# IA y Google de pruebas: un Gemini falso (lo levanta phase67.mjs en :9500) y claves ficticias de Google.
export GEMINI_API_KEY=test-gemini-key GEMINI_BASE_URL=http://localhost:9500 AI_MAX_RPM=60
export GOOGLE_CLIENT_ID=test-client GOOGLE_CLIENT_SECRET=test-secret TOKEN_ENCRYPTION_KEY=$(node -e 'console.log(Buffer.alloc(32,5).toString("base64"))')
export NODE_TLS_REJECT_UNAUTHORIZED=0   # el "servicio push" de pruebas usa un certificado autofirmado
export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_dummykeydummykeydummy ALLOWED_EMAILS=yo@example.com
npm run build >/tmp/build.log 2>&1 || { tail -20 /tmp/build.log; exit 1; }
PORT=3100 nohup npm start > /tmp/next.log 2>&1 &
sleep 5
echo "USER_ID=$USER_ID"

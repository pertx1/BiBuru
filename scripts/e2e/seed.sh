#!/usr/bin/env bash
# Importa la base de ejemplo profity_test en el mini Supabase local. Imprime USER_ID y BIZ.
export PGPASSWORD=postgres
USER_ID=$(psql -h localhost -U postgres -d biburu_test -Atc "select id from auth.users where email='yo@example.com'")
SERVICE=$(node -e '
const c=require("node:crypto");const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const h=b({alg:"HS256",typ:"JWT"}),p=b({role:"service_role",exp:Math.floor(Date.now()/1000)+3600});
console.log(h+"."+p+"."+c.createHmac("sha256","super-secret-jwt-token-with-at-least-32-characters-long").update(h+"."+p).digest("base64url"))')
PROFITY_DATABASE_URL=postgres://postgres:postgres@localhost:5432/profity_test NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=$SERVICE \
  npx tsx scripts/import-profity.ts --email yo@example.com --yes 2>&1 | grep -E "Todo coincide|NO coincide|Error"
echo "USER_ID=$USER_ID"
echo "BIZ=$(psql -h localhost -U postgres -d biburu_test -Atc "select id from businesses where name='Akerra'")"

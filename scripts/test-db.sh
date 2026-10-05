#!/usr/bin/env bash
# Crea una base de datos Postgres limpia con las migraciones y ejecuta los
# tests de permisos (RLS). Necesita un Postgres local (sin Docker):
#   DATABASE_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
set -euo pipefail
ADMIN_URL="${DATABASE_ADMIN_URL:-postgres://postgres:postgres@localhost:5432/postgres}"
DB="biburu_test"
TEST_URL="${ADMIN_URL%/*}/$DB"

psql "$ADMIN_URL" -q -c "drop database if exists $DB" -c "create database $DB"
psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f supabase/tests/00-stub-supabase.sql
for f in supabase/migrations/*.sql; do
  psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f "$f"
done
DATABASE_TEST_URL="$TEST_URL" npx vitest run --no-file-parallelism tests/rls.test.ts tests/business.test.ts

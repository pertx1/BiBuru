#!/usr/bin/env bash
# Crea una base Postgres limpia (biburu_test) con el stub de Supabase y todas las migraciones.
set -euo pipefail
ADMIN_URL="${DATABASE_ADMIN_URL:-postgres://postgres:postgres@localhost:5432/postgres}"
DB="biburu_test"
export TEST_URL="${ADMIN_URL%/*}/$DB"
psql "$ADMIN_URL" -q -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f supabase/tests/00-stub-supabase.sql >/dev/null
for f in supabase/migrations/*.sql; do
  psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done

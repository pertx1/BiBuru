#!/usr/bin/env bash
# Tests de permisos y cálculos en SQL (RLS) contra un Postgres local, sin Docker:
#   DATABASE_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
set -euo pipefail
. scripts/db-setup.sh
DATABASE_TEST_URL="$TEST_URL" npx vitest run --no-file-parallelism tests/rls.test.ts tests/business.test.ts tests/production.test.ts tests/tasks.test.ts tests/notes.test.ts tests/notifications.test.ts tests/ai.test.ts

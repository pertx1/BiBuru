#!/usr/bin/env bash
# Regenera src/lib/supabase/database.types.ts a partir de las migraciones.
set -euo pipefail
. scripts/db-setup.sh
npx supabase gen types typescript --db-url "$TEST_URL" 2>/dev/null | sed '/^Connecting to/d;/^Generated TypeScript/d;/npx oxfmt/d' > src/lib/supabase/database.types.ts
echo "Tipos regenerados."

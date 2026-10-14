#!/usr/bin/env bash
# Applies the Supabase migrations to a throwaway PostgreSQL database (with a stub of the
# Supabase auth/storage schemas) and runs the RLS / constraint test-suite in tests/db.test.ts.
# Usage: TEST_DATABASE_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
set -euo pipefail
ADMIN_URL="${TEST_DATABASE_ADMIN_URL:-postgres://postgres:postgres@localhost:5432/postgres}"
DB="rootcause_test"
psql "$ADMIN_URL" -q -c "drop database if exists $DB with (force);" -c "create database $DB;"
TEST_URL="${ADMIN_URL%/*}/$DB"
psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do
  psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f "$f"
done
echo "Migrations applied to $DB"
TEST_DATABASE_URL="$TEST_URL" npx vitest run tests/db.test.ts

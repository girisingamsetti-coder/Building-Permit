#!/usr/bin/env bash
# Apply Prisma migrations to the remote Supabase project.
#
#   ./scripts/supabase-deploy.sh            # prisma migrate status  (read-only)
#   ./scripts/supabase-deploy.sh deploy     # prisma migrate deploy  (writes DDL)
#   ./scripts/supabase-deploy.sh seed       # prisma seed            (writes rows)
#
# Reads .env.supabase (gitignored) instead of .env, so the local dev database
# in .env is never touched. Prisma 6 has no --env-file flag, hence this wrapper.
#
# NOTE: never put a real password in this file — it is tracked by git.
# Credentials belong in .env.supabase only.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.supabase"
[ -f "$ENV_FILE" ] || { echo "error: $ENV_FILE not found" >&2; exit 1; }

set -a; . "./$ENV_FILE"; set +a

# Validate URL shape rather than matching a placeholder string, so this check
# cannot be broken by search-and-replace and never echoes the credential.
for var in DATABASE_URL DIRECT_URL; do
  url="${!var:-}"
  [ -n "$url" ] || { echo "error: $var is empty in $ENV_FILE" >&2; exit 1; }
  case "$url" in
    postgresql://*) ;;
    *) echo "error: $var is not a postgresql:// URL" >&2; exit 1 ;;
  esac
  ats=$(printf '%s' "$url" | tr -cd '@' | wc -c | tr -d ' ')
  if [ "$ats" -ne 1 ]; then
    echo "error: $var has $ats '@' characters; a valid URL has exactly 1." >&2
    echo "       Percent-encode specials in the password: @ = %40, # = %23, / = %2F" >&2
    exit 1
  fi
done

# Print the target with the password masked, so the log is safe to paste.
echo "target: $(printf '%s' "$DIRECT_URL" | sed -E 's#(//[^:]*:)[^@]*@#\1***@#')"

case "${1:-status}" in
  deploy) npx prisma migrate deploy ;;
  status) npx prisma migrate status ;;
  # DATABASE_URL/DIRECT_URL are already exported above; Node's --env-file does
  # not overwrite variables already present in the environment, so the .env in
  # the repo cannot redirect this at the local database.
  seed)   npx tsx --conditions=react-server --env-file-if-exists=.env prisma/seed/index.ts ;;
  *) echo "usage: $0 [status|deploy|seed]" >&2; exit 2 ;;
esac

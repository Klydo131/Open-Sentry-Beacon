#!/usr/bin/env bash
# Build Hope Beacon's database from nothing, the way a new church does.
#
# ---------------------------------------------------------------------------
# WHY. A church adopting this app creates an empty Supabase project and runs
# every file in supabase/migrations, in order, once. That is the one moment the
# whole history runs from the start, and nobody is watching a test suite when
# it happens. On 23 September 2026 doing exactly this found two ways a fresh
# install stopped halfway (fixed), and a comparison of the result with the live
# database found one protection live had silently lost (restored). This script
# is that proof, kept so it can be run again.
#
# WHAT IT NEEDS: a throwaway database from the same image Supabase runs.
#
#   docker run -d --name hb-fresh -p 5432:5432 -e POSTGRES_PASSWORD=fresh \
#     supabase/postgres:17.6.1.011
#   PGPASSWORD=fresh scripts/fresh-install.sh
#
# It never touches a real project: it refuses to run unless PGHOST is local.
# CI runs it on every push (.github/workflows/fresh-install.yml).
#
# WHAT IT PRINTS at the end is supabase/tests/fingerprint.sql. Run that same
# file against a live project and every line should match.
# ---------------------------------------------------------------------------
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
: "${PGPASSWORD:?set PGPASSWORD to the throwaway database password}"

case "$PGHOST" in
  127.0.0.1|localhost|::1) ;;
  *) echo "Refusing: PGHOST=$PGHOST is not this machine. This script is for a throwaway database only." >&2; exit 2 ;;
esac

here="$(cd "$(dirname "$0")/.." && pwd)"
log="$(mktemp)"
trap 'rm -f "$log"' EXIT

# The image finishes its own setup before it accepts connections for good.
for _ in $(seq 1 60); do
  psql -U postgres -d postgres -tAc 'select 1' >/dev/null 2>&1 && break
  sleep 2
done

psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q \
  -f "$here/supabase/tests/platform-stand-in.sql" >/dev/null

n=0
while IFS= read -r file; do
  n=$((n + 1))
  if ! psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f "$file" >"$log" 2>&1; then
    echo "A fresh install stops at migration $n: $(basename "$file")" >&2
    grep -E 'ERROR|DETAIL|HINT|LINE' "$log" >&2 || cat "$log" >&2
    exit 1
  fi
done < <(find "$here/supabase/migrations" -maxdepth 1 -name '*.sql' | LC_ALL=C sort)

echo "Applied all $n migrations to an empty database in one pass."

psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q \
  -f "$here/supabase/tests/fresh-install-holds.sql"

echo
echo "Fingerprint (compare with the same file run against a live project):"
psql -U postgres -d postgres -tA -F ' ' -f "$here/supabase/tests/fingerprint.sql"

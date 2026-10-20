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
#
# TWO WAYS IN, BECAUSE A CHURCH HAS TWO. By default every file is run with psql,
# one at a time, in byte order -- the manual path in docs/START-HERE.md. With
#
#   PGPASSWORD=fresh scripts/fresh-install.sh --via-cli
#
# the same files go in through `supabase db push`, the one command the guide
# recommends, which also remembers what it applied so the same command later
# installs only what is new. The CLI reads files differently (it skips any name
# that is not <digits>_name.sql), so CI runs both and requires the two
# fingerprints to be identical.
#
# AND A THIRD WAY, WITHOUT SUPABASE. With
#
#   docker run -d --name hb-plain -p 5434:5432 -e POSTGRES_PASSWORD=fresh postgres:17
#   PGPORT=5434 PGPASSWORD=fresh scripts/fresh-install.sh --plain
#
# the same files go into an ordinary Postgres through the Postgres edition's
# installer (selfhost/server/src/migrate.mjs, docs/POSTGRES.md), and the same
# checks run. CI requires its fingerprint to match the Supabase one on every
# line but `extension`: Supabase ships two extensions (pg_cron,
# pg_stat_statements) that the edition replaces or does not need.
# ---------------------------------------------------------------------------
set -euo pipefail

via="psql"
case "${1:-}" in
  '') ;;
  --via-cli) via="cli" ;;
  --plain) via="plain" ;;
  *) echo "Usage: $0 [--via-cli | --plain]" >&2; exit 2 ;;
esac
# Who may plant invented sign-ins for the checks below: Supabase's superuser,
# or on plain Postgres the ordinary one.
su="supabase_admin"
[ "$via" = "plain" ] && su="postgres"
# Pinned, like everything else CI runs: a new CLI release must not change what
# "the same database" means without somebody choosing to move this.
cli_version="${SUPABASE_CLI_VERSION:-2.117.0}"

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

if [ "$via" != "plain" ]; then
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q \
    -f "$here/supabase/tests/platform-stand-in.sql" >/dev/null
fi

if [ "$via" = "plain" ]; then
  if ! DATABASE_URL="postgresql://postgres:${PGPASSWORD}@${PGHOST}:${PGPORT}/postgres" \
       node "$here/selfhost/server/src/migrate.mjs" >"$log" 2>&1; then
    echo "The Postgres edition's install stopped:" >&2
    cat "$log" >&2
    exit 1
  fi
  tail -1 "$log"
elif [ "$via" = "cli" ]; then
  # The throwaway database has no TLS, and a password of letters needs no
  # escaping in a URL. Neither is true of a real project, which is why the guide
  # tells a church to paste the connection string Supabase gives them instead.
  if ! (cd "$here" && npx -y "supabase@$cli_version" db push --include-all --yes \
        --db-url "postgresql://postgres:${PGPASSWORD}@${PGHOST}:${PGPORT}/postgres?sslmode=disable") >"$log" 2>&1; then
    echo "supabase db push stopped:" >&2
    grep -iE 'error|failed|skipping' "$log" >&2 || cat "$log" >&2
    exit 1
  fi
  n="$(psql -U postgres -d postgres -tAc 'select count(*) from supabase_migrations.schema_migrations')"
  echo "Applied $n migrations to an empty database with supabase db push."
  # Said out loud rather than buried: a file the CLI will not read is a file a
  # church using the recommended path never gets.
  grep -i 'skipping migration' "$log" || true
else
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
fi

psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q \
  -f "$here/supabase/tests/fresh-install-holds.sql"

# THE CONVERSATION'S RULES, EXERCISED AS PEOPLE rather than read from the
# catalogue: replies stay in their conversation, reactions are the two people's
# alone, a suspended account and a signed-out visitor get nothing. As the
# superuser, because it plants invented sign-ins in auth.users; inside one
# transaction that is rolled back, so the fingerprint below is unaffected.
psql -U "$su" -d postgres -v ON_ERROR_STOP=1 -q \
  -f "$here/supabase/tests/a-conversation-can-reply-react-and-speak.sql"

# AN OFFICE PLAN HAS A SIZE, the same way: an approved member keeps plans, one
# account cannot fill the database, as invented people, rolled back.
psql -U "$su" -d postgres -v ON_ERROR_STOP=1 -q \
  -f "$here/supabase/tests/an-office-plan-has-a-size.sql"

# A LEADER STAYS WITHIN THEIR RANK: nobody appoints above themselves, and
# nobody moves a pairing to read a conversation that is not theirs. Invented
# people, rolled back.
psql -U "$su" -d postgres -v ON_ERROR_STOP=1 -q \
  -f "$here/supabase/tests/a-leader-stays-within-their-rank.sql"

# A MESSAGE HISTORY OPENS ONLY FOR A REPORT: leadership reads what a withdrawn
# or edited message said only for a reported conversation, and every reading is
# on the record. Invented people, rolled back.
psql -U "$su" -d postgres -v ON_ERROR_STOP=1 -q \
  -f "$here/supabase/tests/a-message-history-needs-a-report.sql"

# A SECOND STEP ONCE SET UP IS REQUIRED: a password alone does not reach the
# data, the live socket or the files for somebody with an authenticator app,
# and changes nothing for anybody without one. Invented people, rolled back.
psql -U "$su" -d postgres -v ON_ERROR_STOP=1 -q \
  -f "$here/supabase/tests/a-second-step-is-required.sql"

# WHAT IS DELETED LEAVES NO FILE BEHIND: removing somebody queues every file
# their rows pointed at, and only the service role can read or clear the list.
psql -U "$su" -d postgres -v ON_ERROR_STOP=1 -q \
  -f "$here/supabase/tests/what-is-deleted-leaves-no-file-behind.sql"

# A POST CARRIES ITS OWN PHOTOS: a writer's photos and clip reach exactly the
# people who may read the post, and nobody adds to somebody else's.
psql -U "$su" -d postgres -v ON_ERROR_STOP=1 -q \
  -f "$here/supabase/tests/a-post-carries-its-own-photos.sql"

# THE COURT ROOM HOLDS: a fresh code or password at the door, a recorded seat
# to read a case, a record that finds what changed, exhibits that stay as they
# were entered. Invented people, rolled back.
psql -U "$su" -d postgres -v ON_ERROR_STOP=1 -q \
  -f "$here/supabase/tests/the-court-room-holds.sql"

# LEAVE TO ANSWER HOLDS, AND THE RECORD OUTLIVES THE ACCOUNT: a suspended
# member let in by the judge reaches one case and nothing else, and is shut out
# again when the leave ends; a report or a case stays when an account is
# deleted, showing it as deleted. Invented people, rolled back.
psql -U "$su" -d postgres -v ON_ERROR_STOP=1 -q \
  -f "$here/supabase/tests/leave-to-answer-holds.sql"

echo
echo "Fingerprint (compare with the same file run against a live project):"
psql -U postgres -d postgres -tA -F ' ' -f "$here/supabase/tests/fingerprint.sql"

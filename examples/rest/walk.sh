#!/usr/bin/env bash
# The Hope Beacon walk-through with nothing but curl and jq.
#
# Every other example in this folder does exactly these calls, in its own
# language. Read this one first: it is the whole protocol, one request at a time.
#
#   HB_URL=https://<project>.supabase.co HB_KEY=your-publishable-key \
#   HB_EMAIL=you@example.org HB_PASSWORD='...' ./walk.sh
#
# HB_SEND='Hello' also sends that text into your conversation. Without it,
# nothing is written.
set -euo pipefail
: "${HB_URL:?Set HB_URL to your project address}"
: "${HB_KEY:?Set HB_KEY to your project publishable (anon) key}"
: "${HB_EMAIL:?Set HB_EMAIL}"
: "${HB_PASSWORD:?Set HB_PASSWORD}"

# One request. Prints the body; stops with the server's own words on failure.
call() {
  local method=$1 path=$2 body=${3:-}
  local out status
  out=$(curl -sS -X "$method" "$HB_URL$path" \
    -H "apikey: $HB_KEY" -H "Authorization: Bearer ${TOKEN:-$HB_KEY}" \
    -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
    ${body:+-d "$body"} -w $'\n%{http_code}')
  status=${out##*$'\n'}; out=${out%$'\n'*}
  if [ "$status" -ge 400 ]; then
    if [ "$(jq -r '.code // empty' <<<"$out")" = PT403 ]; then
      echo "This account uses two-step sign-in. See docs/IN-ANY-LANGUAGE.md, \"Two-step sign-in\"." >&2; exit 2
    fi
    echo "Request failed ($status): $(jq -r '.message // .msg // .error_description // .' <<<"$out")" >&2; exit 1
  fi
  printf '%s' "$out"
}

# 1. Sign in. The answer carries a token that proves who you are for an hour.
signin=$(call POST '/auth/v1/token?grant_type=password' \
  "$(jq -n --arg e "$HB_EMAIL" --arg p "$HB_PASSWORD" '{email: $e, password: $p}')")
TOKEN=$(jq -r .access_token <<<"$signin")
ME=$(jq -r .user.id <<<"$signin")

# 2. Who am I. The database only ever shows you your own row and the rows
#    your role allows; nothing in this script decides that.
me=$(call GET "/rest/v1/profiles?id=eq.$ME&select=full_name,role")
role=$(jq -r '.[0].role' <<<"$me")
case $role in ds) label=Explorer ;; dm) label=Guide ;; admin) label=Director ;; executive) label='Executive Director' ;; *) label=$role ;; esac
echo "Signed in as $(jq -r '.[0].full_name' <<<"$me") ($label)."

# 3. The conversations you are in. No filter is needed: the rules filter.
pairings=$(call GET '/rest/v1/pairings?select=id,journey_stage&order=created_at.asc')
echo "Conversations you can see: $(jq length <<<"$pairings")"
[ "$(jq length <<<"$pairings")" -eq 0 ] && { echo 'No conversation yet.'; exit 0; }
pairing=$(jq -r '.[0].id' <<<"$pairings")

# 4. Its five newest messages, shown oldest first.
messages=$(call GET "/rest/v1/messages?pairing_id=eq.$pairing&select=sender_id,body&order=created_at.desc&limit=5")
echo "Latest messages (journey stage: $(jq -r '.[0].journey_stage' <<<"$pairings")):"
jq -r --arg me "$ME" 'reverse[] | "  " + (if .sender_id == $me then "You: " else "Them:" end) + " " + .body' <<<"$messages"

# 5. Only when asked: send one message as yourself.
if [ -n "${HB_SEND:-}" ]; then
  call POST /rest/v1/messages \
    "$(jq -n --arg p "$pairing" --arg s "$ME" --arg b "$HB_SEND" '{pairing_id: $p, sender_id: $s, body: $b}')" >/dev/null
  echo "Sent: $HB_SEND"
fi

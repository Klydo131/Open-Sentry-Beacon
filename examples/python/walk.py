"""The Hope Beacon walk-through in Python 3.9+, with the httpx library.

    pip install -r requirements.txt
    HB_URL=... HB_KEY=... HB_EMAIL=... HB_PASSWORD=... python walk.py
    HB_SEND='Hello' python walk.py     # also sends one message

examples/rest/walk.sh is the same walk with curl, one request at a time.
"""
import os
import sys

import httpx

ROLES = {"ds": "Explorer", "dm": "Guide", "admin": "Director", "executive": "Executive Director"}


def need(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        sys.exit(f"Set {name}.")
    return value


URL, KEY = need("HB_URL"), need("HB_KEY")
EMAIL, PASSWORD = need("HB_EMAIL"), need("HB_PASSWORD")
SEND = os.environ.get("HB_SEND")

client = httpx.Client(base_url=URL, headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"}, timeout=15)


def call(method: str, path: str, body=None):
    """One request; the server's own words on failure."""
    res = client.request(method, path, json=body, headers={"Prefer": "return=representation"})
    data = res.json() if res.content else None
    if res.is_error:
        if isinstance(data, dict) and data.get("code") == "PT403":
            print('This account uses two-step sign-in. See docs/IN-ANY-LANGUAGE.md, "Two-step sign-in".', file=sys.stderr)
            sys.exit(2)
        message = (data or {}).get("message") or (data or {}).get("msg") or res.reason_phrase
        print(f"Request failed ({res.status_code}): {message}", file=sys.stderr)
        sys.exit(1)
    return data


# 1. Sign in.
signin = call("POST", "/auth/v1/token?grant_type=password", {"email": EMAIL, "password": PASSWORD})
client.headers["Authorization"] = f"Bearer {signin['access_token']}"
me = signin["user"]["id"]

# 2. Who am I. The database decides what each person may read.
profile = call("GET", f"/rest/v1/profiles?id=eq.{me}&select=full_name,role")[0]
print(f"Signed in as {profile['full_name']} ({ROLES.get(profile['role'], profile['role'])}).")

# 3. The conversations you are in. The rules do the filtering.
pairings = call("GET", "/rest/v1/pairings?select=id,journey_stage&order=created_at.asc")
print(f"Conversations you can see: {len(pairings)}")
if not pairings:
    print("No conversation yet.")
    sys.exit(0)
pairing = pairings[0]

# 4. Its five newest messages, shown oldest first.
messages = call("GET", f"/rest/v1/messages?pairing_id=eq.{pairing['id']}&select=sender_id,body&order=created_at.desc&limit=5")
print(f"Latest messages (journey stage: {pairing['journey_stage']}):")
for m in reversed(messages):
    print(f"  {'You: ' if m['sender_id'] == me else 'Them:'} {m['body']}")

# 5. Only when asked: send one message as yourself.
if SEND:
    call("POST", "/rest/v1/messages", {"pairing_id": pairing["id"], "sender_id": me, "body": SEND})
    print(f"Sent: {SEND}")

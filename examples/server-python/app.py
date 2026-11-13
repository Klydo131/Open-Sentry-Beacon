"""Your own Hope Beacon server in Python (FastAPI), with every rule still in the database.

This is the pattern for building a server in any language without rewriting
Hope Beacon's privacy rules. For each request:

  1. ask the sign-in service whether the person's token is genuine;
  2. open a transaction and, for that transaction only, tell the database who
     is asking (request.jwt.claims) and switch to the `authenticated` role;
  3. run the app's own check before every request (suspended, ended session,
     two-step sign-in owed);
  4. run your query. The database's row rules decide what comes back.

    pip install -r requirements.txt
    DATABASE_URL=... HB_URL=... HB_KEY=... uvicorn app:app --port 8080

DATABASE_URL can read everything. Keep it on the server, never in an app or a
browser. See docs/IN-ANY-LANGUAGE.md.
"""
import base64
import json
import os

import httpx
import psycopg
from fastapi import FastAPI, Header, HTTPException

DATABASE_URL = os.environ["DATABASE_URL"]
HB_URL, HB_KEY = os.environ["HB_URL"], os.environ["HB_KEY"]

app = FastAPI(title="Hope Beacon, your own server")
auth = httpx.Client(base_url=HB_URL, headers={"apikey": HB_KEY}, timeout=10)

# What the database's refusals mean over HTTP, as Supabase's own data API maps them.
STATUS = {"PT401": 401, "PT403": 403, "42501": 403}


def claims_for(authorization: str | None) -> dict:
    """The token's claims, once the sign-in service has said the token is genuine."""
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token or auth.get("/auth/v1/user", headers={"Authorization": f"Bearer {token}"}).status_code != 200:
        raise HTTPException(401, "Sign in first.")
    payload = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))


def as_person(claims: dict, sql: str, params: tuple = ()) -> list[dict]:
    """Run one query as the person, inside the database's rules."""
    try:
        with psycopg.connect(DATABASE_URL) as conn, conn.transaction(), conn.cursor() as cur:
            cur.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps(claims),))
            cur.execute("set local role authenticated")
            cur.execute("select public.refuse_suspended_requests()")
            cur.execute(sql, params)
            cols = [c.name for c in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
    except psycopg.Error as e:
        code = e.sqlstate or ""
        raise HTTPException(STATUS.get(code, 400), getattr(e.diag, "message_primary", None) or "Refused.")


@app.get("/me")
def me(authorization: str | None = Header(default=None)):
    claims = claims_for(authorization)
    rows = as_person(claims, "select full_name, role from public.profiles where id = %s", (claims["sub"],))
    return rows[0] if rows else {}


@app.get("/conversations")
def conversations(authorization: str | None = Header(default=None)):
    # No filter: the row rules return only the conversations this person is in.
    return as_person(claims_for(authorization), "select id::text, journey_stage from public.pairings order by created_at")


@app.get("/conversations/{pairing_id}/messages")
def messages(pairing_id: str, authorization: str | None = Header(default=None)):
    return as_person(
        claims_for(authorization),
        "select sender_id::text, body, created_at::text from public.messages "
        "where pairing_id = %s::uuid order by created_at desc limit 20",
        (pairing_id,),
    )

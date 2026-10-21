// The court room's door can take a code sent by email, where a project chooses.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 21 October 2026, after an authenticator app would not work on
// the owner's live project three times running: "can we just have e-mail
// verification instead for this. In the open source code, developers can
// choose to have options with their security if something is not working. I
// want email verification on mine."
//
// WHAT HOLDS, each checked below and each broken on purpose once to watch the
// check go red. The database's own behaviour (codes, tries, expiry, one
// session, the pass ending with it) is proved by
// supabase/tests/the-court-room-door-by-email.sql, which this checks is run.
//
//   node tests/the-court-room-door-by-email.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (p) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const sql = (p) => read(p).replace(/--[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const MIGRATION = 'supabase/migrations/20261021100000_the_court_room_door_by_email.sql';
const m = sql(MIGRATION);
const fn = code('supabase/functions/door-code/index.ts');
const door = code('components/court/CourtDoorPanel.tsx');
const lib = code('lib/live/court-door.ts');

// 1. The choice is the project's, and nothing changes without it.
const method = /function private\.court_door_method\(\)[\s\S]*?\$\$;/.exec(m)?.[0] ?? '';
ok(/key = 'COURT_DOOR_METHOD'/.test(method) && /= 'email' then 'email'\s*else 'authenticator'/.test(method),
  'the method is one row in app_settings, and anything but "email" means an authenticator app, as before');
ok(/revoke all on function private\.court_door_method\(\)\s+from public, anon, authenticated/.test(m),
  'and no browser can ask the setting directly');

// 2. Only the server makes a code, and a browser can never read one.
ok(/revoke all on function public\.court_email_code_issue\(uuid, uuid\)\s+from public, anon, authenticated/.test(m)
  && /grant execute on function public\.court_email_code_issue\(uuid, uuid\) to service_role/.test(m)
  && !/grant execute on function public\.court_email_code_issue\(uuid, uuid\)\s+to authenticated/.test(m),
  'a code is made by the service role only (a browser that could make one would read it without the email)');
ok(/revoke all on private\.court_email_codes, private\.court_email_sends, private\.court_email_passes\s+from public, anon, authenticated/.test(m),
  'nobody signed in can read the codes, the sends or the passes');
ok(/values \(p_user, p_session, v_salt, private\.court_email_code_hash\(v_salt, v_code\)\)/.test(m)
  && !/create table if not exists private\.court_email_codes \([^;]*\bcode\s+text/.test(m),
  'only a salted hash of a code is kept');
const issue = /function public\.court_email_code_issue[\s\S]*?\$\$;/.exec(m)?.[0] ?? '';
ok(/s\.id = p_session and s\.user_id = p_user/.test(issue),
  'a code is made only for one of the person\'s own live sessions');
ok(/role in \('admin', 'executive'\)/.test(issue) && /suspended_at is null/.test(issue) && /mfa_factors/.test(issue),
  'and only for an unsuspended leader without an authenticator app');

// 3. Proving it: this session, ten minutes, five tries, once.
const prove = /function public\.court_email_code_prove[\s\S]*?\$\$;/.exec(m)?.[0] ?? '';
ok(/session_id = v_session/.test(prove) && /auth\.jwt\(\) ->> 'session_id'/.test(prove),
  'a code is proved against the session it was sent for');
ok(/interval '10 minutes'/.test(prove) && /tries \+ 1 >= 5/.test(prove),
  'within ten minutes and five tries');
ok(!/raise exception[^;]*did not match/.test(prove) && /'reason', 'wrong'/.test(prove),
  'a wrong code is answered, not raised, so the try is counted rather than rolled back');
ok(/delete from private\.court_email_codes where user_id = v_user and session_id = v_session;\s*insert into private\.court_email_passes/.test(prove),
  'and a right one is used up as it opens the door');

// 4. The door.
const pass = /function private\.court_pass_until\(\)[\s\S]*?\$\$;/.exec(m)?.[0] ?? '';
ok(/court_door_method\(\) = 'email'/.test(pass) && /join auth\.sessions s on s\.id = ep\.session_id/.test(pass),
  'an emailed code opens the door only where the project chose email, and only while its session lives');
ok(/e ->> 'method' = 'totp'/.test(pass) && /claims ->> 'aal', ''\) = 'aal2'/.test(pass),
  'an authenticator app\'s code still opens it');
ok(/and not suspended and two_step then 'code'\s*when[^\n]*method = 'email' then 'email'/.test(m),
  'a leader with an authenticator app is asked for its code before email is offered');
ok(/court_door_method\(\) = 'email'\s*or exists \(select 1 from auth\.mfa_factors/.test(m),
  'with email, every leader can be drawn as judge');

// 5. The server function.
ok(/admin\.auth\.getUser\(token\)/.test(fn) && fn.indexOf('getUser(token)') < fn.indexOf("rpc('court_email_code_issue'"),
  'the function checks who is asking before any code is made');
ok(/p_session: session/.test(fn) && /sessionOf\(token\)/.test(fn),
  'and makes it for the session of the token that asked');
const replies = [...fn.matchAll(/return json\(\{([^{}]*)\}/g)].map((r) => r[1]);
ok(replies.length >= 5 && replies.every((r) => !/\bcode\b\s*[,:}]|\bcode\s*$/.test(r.trim())),
  'no reply carries the code back to the browser');
ok(/BREVO_API_KEY/.test(fn) && /503/.test(fn),
  'a project that cannot send email is told so, plainly, rather than left waiting');
ok(fn.indexOf("setting(admin, 'BREVO_API_KEY')") > 0 && fn.indexOf("setting(admin, 'BREVO_API_KEY')") < fn.indexOf("rpc('court_email_code_issue'"),
  'and is told before a code is made, so nobody\'s codes for the hour are used up for nothing');

// 6. The screen.
ok(/door\.needs === 'email'[\s\S]{0,80}<EmailDoor/.test(door), 'the door asks for an emailed code when the database says so');
ok(/sendDoorCode\(\)/.test(door) && /openWithEmailCode\(code\)/.test(door), 'it sends the code, then proves it');
ok(/functions\.invoke\('door-code'/.test(lib) && /rpc\('court_email_code_prove'/.test(lib),
  'through the function and the database, nothing else');
ok(/min-h-\[44px\]/.test(/data-court-email-resend[\s\S]{0,300}/.exec(door)?.[0] ?? ''),
  '"Send a new code" is big enough to tap');

// 7. Proved on every fresh install, and written down.
ok(/supabase\/tests\/the-court-room-door-by-email\.sql/.test(read('scripts/fresh-install.sh')),
  'the database proof runs on every fresh install (and so in CI)');
ok(/COURT_DOOR_METHOD/.test(read('docs/COURT-ROOM.md')) && /COURT_DOOR_METHOD/.test(read('docs/EMAIL.md')),
  'the developer guide and the email guide say how to choose it');

console.log(bad ? `\nRESULT: ${bad} FAILED` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);

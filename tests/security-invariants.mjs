// Security invariants that must not regress, checked from the source.
//
// This file exists because an audit is a photograph and a test is a promise.
// Every check below corresponds to something that was verified by hand during
// the 2026-08-08 audit and could be undone by an ordinary, well-meaning change
// six months from now — a new dependency, a new link field, a new API route, a
// CSP directive loosened to make an embed work.
//
// Each check says WHY it is here, because an invariant nobody understands is an
// invariant somebody deletes.
//
//   node tests/security-invariants.mjs
//
// Plain Node, no dependencies. Exits non-zero on any violation.
import fs from 'node:fs';
import path from 'node:path';
import { stripTs } from './_strip.mjs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

/**
 * The source of every live screen, concatenated.
 *
 * For assertions about what the signed-in app DOES rather than about one file.
 * Covers components/live/* and any remaining Live*.tsx, so a screen moving
 * between them cannot switch an invariant off.
 *
 * This exists because it happened: two checks here read
 * components/LiveCorePages.tsx by name, that file was split by screen, and the
 * checks went quiet. For a safeguarding placement check that is the worst way
 * to fail, and the comment beside it already warned that placement is what a
 * refactor removes without noticing.
 */
const liveScreens = () => {
  const out = [];
  for (const dir of ['components/live', 'components']) {
    if (!exists(dir)) continue;
    for (const f of fs.readdirSync(path.join(root, dir))) {
      if (!f.endsWith('.tsx')) continue;
      if (dir === 'components' && !/^Live/.test(f)) continue;
      out.push(read(`${dir}/${f}`));
    }
  }
  return out.join('\n');
};


let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

function walk(dir, out = []) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return out;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(rel, out);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

const sourceDirs = ['app', 'components', 'lib'].filter(exists);
const sources = sourceDirs.flatMap((d) => walk(d));
ok(sources.length > 20, `there is source to check (${sources.length} files)`);

// ---------------------------------------------------------------------------
// 1. The image optimiser stays off.
//
// `sharp` carries four known libvips CVEs and ships as a Next.js dependency.
// They are UNREACHABLE here for one reason only: this app never invokes the
// optimiser. `images.unoptimized` is true and nothing imports `next/image`, so
// no attacker-supplied bytes are ever handed to libvips. Add one `next/image`
// and that stops being true silently — the build would still pass, the app would
// still work, and a high-severity CVE would quietly become live.
// ---------------------------------------------------------------------------
const nextConfig = ['next.config.mjs', 'next.config.js', 'next.config.ts'].find(exists);
ok(!!nextConfig, `next config found (${nextConfig})`);
if (nextConfig) {
  const cfg = read(nextConfig);
  ok(
    /images:\s*\{[^}]*unoptimized:\s*true/.test(cfg),
    'images.unoptimized is true, so sharp/libvips is never handed any bytes',
  );
}
const usesNextImage = sources.filter((f) => /from ['"]next\/image['"]/.test(read(f)));
ok(
  usesNextImage.length === 0,
  usesNextImage.length === 0
    ? 'nothing imports next/image, so the optimiser has no entry point'
    : `next/image is imported by ${usesNextImage.join(', ')} — the sharp CVEs become reachable`,
);

// ---------------------------------------------------------------------------
// 2. The Content-Security-Policy keeps its teeth.
//
// The specific things that must not be loosened, and why each one matters more
// than it looks.
// ---------------------------------------------------------------------------
if (nextConfig) {
  const cfg = read(nextConfig);
  ok(/frame-ancestors 'none'/.test(cfg), "frame-ancestors 'none' — no clickjacking a church's admin");
  ok(/base-uri 'self'/.test(cfg), "base-uri 'self' — a <base> tag can redirect every relative URL");
  ok(/form-action 'self'/.test(cfg), "form-action 'self' — a form cannot be made to post elsewhere");
  ok(/object-src|default-src 'self'/.test(cfg), "default-src 'self' — nothing loads from anywhere else by default");
  // A wildcard in script-src would let any host run code in the app's origin,
  // which is game over for every other control in this file.
  // Match either quoting. This directive became a TEMPLATE LITERAL when
  // 'unsafe-eval' was made conditional on development, and the old
  // /"script-src[^"]*"/ stopped matching — so it printed "(not found)" and
  // PASSED, because an empty string contains no wildcard. A security check that
  // silently stops checking is worse than no check at all: it still reports OK.
  // Hence the explicit found/not-found assertion below.
  const scriptSrcMatch = cfg.match(/["`]script-src[^"`]*["`]/);
  ok(!!scriptSrcMatch, 'the script-src directive is where this check can see it');
  const scriptSrc = scriptSrcMatch ? scriptSrcMatch[0] : '';
  ok(
    !!scriptSrc && !/\bhttps?:(\s|["`]|$)|\*/.test(scriptSrc),
    `script-src names no wildcard and no third-party origin (${scriptSrc || 'NOT FOUND'})`,
  );
  // 'unsafe-eval' is permitted only inside the development conditional.
  ok(
    !/["`]script-src[^"`]*'unsafe-eval'/.test(cfg) &&
      (!/'unsafe-eval'/.test(cfg) || /DEV \?/.test(cfg)),
    "'unsafe-eval' is dev-only, never in the shipped policy",
  );
  ok(
    /X-Content-Type-Options.*nosniff/s.test(cfg),
    'nosniff — an uploaded file must not be re-interpreted as script',
  );
}

// ---------------------------------------------------------------------------
// 3. Links entered by people cannot become code.
//
// `safeExternalUrl` is the only thing between an admin typing a URL into a
// material and a stored XSS. It is one regex, so it is exactly the sort of thing
// that gets "simplified" later.
// ---------------------------------------------------------------------------
if (exists('lib/url.ts')) {
  // BEHAVIOUR, NOT SHAPE. This used to scrape the regex out of the file with a
  // match and an eval, then run payloads against the extracted pattern. That
  // tested the mechanism rather than the property, so it failed the moment the
  // mechanism improved — the guard is now a URL parse rather than a regex, and
  // is stricter than what it replaced.
  //
  // Calling the real function is better in every way: no eval, no assumption
  // about how it is written, and it keeps working through the next rewrite.
  const { safeExternalUrl, safeLinkHref } = await import('../lib/url.ts');

  for (const payload of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '//evil.example.com',
    'jAvAsCrIpT\n:alert(1)',
    // The @ deception: a valid https URL whose host is what follows the @,
    // while a reader sees the trustworthy name before it. The regex this
    // replaced matched these, and they reach an Explorer through a lesson link.
    'https://adventist.org@evil.example/give',
    'https://www.paypal.com@192.168.1.1/login',
  ]) {
    ok(safeExternalUrl(payload) === null, `blocked: ${JSON.stringify(payload)}`);
  }
  for (const good of ['https://example.com/a', 'http://example.com']) {
    ok(safeExternalUrl(good) === good, `allowed: ${good}`);
  }

  // safeLinkHref allows an in-app path as well, and must refuse the one that
  // looks like a path and is not.
  ok(safeLinkHref('/join?token=abc') === '/join?token=abc', 'an in-app path is allowed');
  ok(safeLinkHref('//evil.example/x') === null, 'a protocol-relative URL is refused');
  ok(safeLinkHref('https://adventist.org@evil.example') === null,
     'safeLinkHref inherits the user-info refusal');
}

// ---------------------------------------------------------------------------
// 4. The backend seam cannot become the thing that leaks the key.
//
// lib/backend/feedback.ts is the one place this app is designed to be pointed
// at a server, so it is the one place somebody will reasonably think a
// credential belongs. It does not: that file ships to the browser exactly like
// every other file here, and a key in it is a key published to every visitor.
//
// tests/no-secrets.js catches credential shapes anywhere in the repository.
// This is the narrower check on the file most likely to attract one, plus the
// two properties the whole design rests on: the default sink really stores the
// message rather than pretending to, and a failure is reported rather than
// thrown — because a thrown sink loses what somebody wrote.
// ---------------------------------------------------------------------------
if (exists('lib/backend/feedback.ts')) {
  const sink = read('lib/backend/feedback.ts');
  // Strip comments first — the teaching notes in that file are allowed to name
  // the things they are warning about.
  const code = sink.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
  ok(
    !/\b(apiKey|api_key|Authorization|Bearer\s+[A-Za-z0-9])/i.test(code),
    'the feedback sink carries no key or Authorization header of its own',
  );
  ok(
    /return \{ ok: false \}/.test(code),
    'a failing sink returns { ok: false } rather than throwing the message away',
  );
  ok(
    /localStorage\.setItem\(STORE_KEY/.test(code),
    'the default sink really stores the message instead of pretending to',
  );
}

// ---------------------------------------------------------------------------
// 5. No untrusted markup sink.
//
// One dangerouslySetInnerHTML exists (the self-heal bootstrap) and its content
// is a module-level constant. Any interpolation into it, or any new sink, is an
// XSS waiting for an input.
// ---------------------------------------------------------------------------
for (const f of sources) {
  const src = read(f);
  const sinks = src.match(/dangerouslySetInnerHTML=\{\{\s*__html:\s*([^}]+)\}\}/g) || [];
  for (const sink of sinks) {
    ok(
      /__html:\s*[A-Z_][A-Z0-9_]*\s*$/.test(sink.replace(/\}\}$/, '').trim()),
      `${f}: innerHTML is a constant, not interpolated (${sink.slice(0, 60)})`,
    );
  }
  ok(!/\beval\s*\(/.test(src.replace(/\/\/.*/g, '')) || f.includes('tests/'), `${f}: no eval`);
}

// ---------------------------------------------------------------------------
// 6. CI cannot be made to run an attacker's code.
//
// `pull_request_target` runs with repository secrets and a writable token while
// checking out a fork's code. It is the single most common way a repository is
// taken over through a pull request.
// ---------------------------------------------------------------------------
const wfDir = '.github/workflows';
if (exists(wfDir)) {
  for (const f of fs.readdirSync(path.join(root, wfDir))) {
    if (!/\.ya?ml$/.test(f)) continue;
    // Full-line YAML comments are stripped first: a workflow that explains why
    // `pull_request_target` is dangerous is doing the right thing, and failing
    // it would teach people to delete the explanation.
    const wf = read(path.join(wfDir, f))
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    ok(!/pull_request_target/.test(wf), `${f}: no pull_request_target`);
    // Interpolating an event field straight into a shell is command injection:
    // a branch or title containing $(...) executes on the runner.
    const injectable = wf.match(/run:[\s\S]{0,400}?\$\{\{\s*github\.event\.[^}]+\}\}/g) || [];
    ok(injectable.length === 0, `${f}: no github.event.* interpolated into a run: block`);
  }
}

// ---------------------------------------------------------------------------
// 7. A privileged key never reaches the browser.
//
// A component marked 'use client' is downloaded, in full, by every visitor. A
// key named in one is a key given away, and the mistake looks harmless while
// you are writing it: you needed one admin query on a screen, so you reached
// for the credential that could do it.
//
// The names below are the ones providers actually use for the "bypasses every
// rule" credential. tests/no-secrets.js catches credential SHAPES anywhere in
// the repository; this catches the NAME in the one place it does most damage.
// ---------------------------------------------------------------------------
const PRIVILEGED = /SERVICE_ROLE|service_role|SERVICE_ACCOUNT|serviceAccount|ADMIN_KEY|SECRET_KEY|PRIVATE_KEY/;
const clientish = sources.filter((f) => f.startsWith('components/') || f.startsWith('app/'));
for (const f of clientish) {
  const src = read(f);
  if (/^\s*['"]use client['"]/m.test(src)) {
    ok(
      !PRIVILEGED.test(src),
      `${f}: a client component names no privileged key`,
    );
  }
}

// ---------------------------------------------------------------------------
// 9. A push notification chooses the SCREEN, never the SITE.
//
// The service worker takes a URL out of the push payload and hands it to
// client.navigate()/clients.openWindow(). Unvalidated, that means one
// compromised or simply mistaken push sends every phone that taps the
// notification anywhere on the internet, inside the window the person believes
// is this app. The worker resolves the value against its own origin and drops
// anything that leaves it; this check is here because that guard is four lines
// inside an escaped string constant and is very easy to lose in a rewrite.
// ---------------------------------------------------------------------------
const swRoute = ['app/sw.js/route.ts', 'app/sw.js/route.js'].find(exists);
ok(!!swRoute, `service worker route found (${swRoute})`);
if (swRoute) {
  const raw = read(swRoute);
  const m = raw.match(/const SOURCE = ("(?:[^"\\]|\\.)*");/s);
  ok(!!m, `${swRoute}: the worker source is a single string constant`);
  if (m) {
    const worker = JSON.parse(m[1]);
    // Parse it. A worker with a syntax error is served happily by this route
    // and then fails silently in the browser, which costs the whole offline
    // shell and the update path with it.
    ok(
      (() => {
        try {
          new Function(worker.split('__BEACON_BUILD__').join('x'));
          return true;
        } catch {
          return false;
        }
      })(),
      `${swRoute}: the generated worker parses as JavaScript`,
    );
    const click = worker.slice(worker.indexOf("addEventListener('notificationclick'"));
    const handler = click.slice(0, click.indexOf('\n});'));
    ok(
      /new URL\(\s*raw\s*,\s*self\.location\.origin\s*\)/.test(handler),
      `${swRoute}: the notification target is resolved against this origin`,
    );
    ok(
      /u\.origin === self\.location\.origin/.test(handler),
      `${swRoute}: a cross-origin notification target is refused`,
    );
    ok(
      !/const target = \(event\.notification\.data/.test(handler),
      `${swRoute}: the payload URL is not used as the target directly`,
    );
  }
}

// ---------------------------------------------------------------------------
// 10. Search visibility is decided ONCE, and defaults to invisible.
//
// Three separate signals control whether this deployment can be found: the
// `robots` metadata in app/layout.tsx, app/robots.ts, and the X-Robots-Tag
// header in next.config.mjs. They used to be three hard-coded "no"s, each with
// a comment saying "change all three, or none" — an instruction that gets
// followed twice out of three times, and a half-change is the worst outcome
// available: a site indexed while everybody believes it is not.
//
// They now read one variable. This check is what keeps them reading it, and
// what keeps the DEFAULT at "no" — a church deployment holds real people's
// names, so being findable has to be opted into, never arrived at by omission.
// ---------------------------------------------------------------------------
const SWITCH = 'BEACON_PUBLIC_SITE';
ok(exists('lib/site-visibility.ts'), 'the search-visibility switch has one home');
if (exists('lib/site-visibility.ts')) {
  const vis = read('lib/site-visibility.ts');
  ok(
    new RegExp(`process\\.env\\.${SWITCH}\\s*===\\s*'1'`).test(vis),
    `site-visibility opts IN on ${SWITCH}=1, so anything unset stays private`,
  );
}
for (const f of ['app/layout.tsx', 'app/robots.ts']) {
  if (!exists(f)) continue;
  ok(
    /from '@\/lib\/site-visibility'/.test(read(f)),
    `${f}: reads the shared switch rather than hard-coding an answer`,
  );
}
if (nextConfig) {
  const cfg = read(nextConfig);
  // The config is .mjs and cannot import the TypeScript module, so it reads the
  // variable directly. That is the one permitted duplication and this is why it
  // is checked here.
  ok(
    new RegExp(`process\\.env\\.${SWITCH}\\s*===\\s*'1'`).test(cfg),
    `${nextConfig}: reads the same switch, on the same opt-in polarity`,
  );
  ok(
    /X-Robots-Tag/.test(cfg) && /indexable \?\s*\[\]/.test(cfg),
    `${nextConfig}: the noindex header is present unless the switch is on`,
  );
}
// And the default really is private: evaluate it with nothing set.
ok(
  process.env[SWITCH] !== '1',
  `${SWITCH} is not set in this environment, so the checks above describe the default`,
);

// ---------------------------------------------------------------------------
// 11. The mailbox call-to-action is a link this app chose.
//
// `safeExternalUrl` demands an absolute http(s) URL, which is right for a
// material an admin typed and wrong for the mailbox, whose call-to-action is
// normally a path in this same app. So the mailbox uses `safeLinkHref`, which
// accepts a rooted path OR an http(s) URL and refuses everything else.
//
// This was safe by accident before: every value reaching it is composed by the
// app. The day a fork has a server compose these messages, that stops being
// true, and the failure mode is a hostile link inside a message the reader
// believes came from their church.
//
// BEHAVIOUR, NOT SHAPE. This block used to scrape the regex out of lib/url.ts,
// eval it, and rebuild a copy of `safeLinkHref` around it — then check that the
// copy matched the source line by line. Every one of those checks pinned the
// mechanism: the guard is now a URL parse rather than a regex, and the suite
// failed for the guard getting stricter. The payloads below run through the
// real function, so the next rewrite is judged on what it refuses.
// ---------------------------------------------------------------------------
if (exists('lib/url.ts')) {
  ok(/export function safeLinkHref/.test(read('lib/url.ts')), 'lib/url.ts exports safeLinkHref');
  const { safeLinkHref } = await import('../lib/url.ts');

  for (const bad of [
    'javascript:alert(1)',
    ' javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '//evil.example/x',
    'evil.example/x',
    'file:///etc/passwd',
    // A relative path is not a rooted one. `join?token=abc` resolves against
    // whatever page the reader happens to be on, which is not a link the app
    // chose — it is a link the reader's history chose.
    'join?token=abc',
    // And the deception, because the mailbox reaches people who were sent the
    // message rather than people who went looking for it.
    'https://adventist.org@evil.example/give',
  ]) {
    ok(safeLinkHref(bad) === null, `mailbox href refuses ${JSON.stringify(bad)}`);
  }
  for (const good of ['/join?token=abc', '/login', 'https://example.com/a']) {
    ok(safeLinkHref(good) === good, `mailbox href allows ${good}`);
  }
}

if (exists('components/Mailbox.tsx')) {
  const mail = read('components/Mailbox.tsx').replace(/\/\/.*$/gm, '');
  ok(!/href=\{m\.link\}/.test(mail), 'Mailbox never renders m.link as an href directly');
  ok(/safeLinkHref\(m\.link\)/.test(mail), 'Mailbox routes the call-to-action through safeLinkHref');
}

// ---------------------------------------------------------------------------
// 12. Live sign-in is a gateway, never a disguised sample-data tutorial.
//
// The public repository intentionally keeps its sample walkthrough. A church
// deployment intentionally does not: setting its database variables changes
// the front door to e-mail/password authentication and removes the tutorial
// hosts from the rendered layout. Both halves are asserted because deleting
// either branch would make one mode silently impersonate the other.
// ---------------------------------------------------------------------------
if (exists('app/login/page.tsx') && liveScreens()) {
  const login = read('app/login/page.tsx');
  const livePages = liveScreens();
  const layout = read('app/layout.tsx');
  // The choice moved from a build-time constant to a per-visitor one when the
  // tutorial got its own door (lib/tutorial.tsx), so the shape to assert is
  // `live ? <LiveLoginPage/> : <DemoLogin/>` fed by useIsLive(). What is being
  // protected is unchanged and is asserted below as well: the two modes must
  // still be separate branches, because deleting either would let one silently
  // impersonate the other.
  ok(/live\s*\?\s*<LiveLoginPage\s*\/>\s*:\s*<DemoLogin\s*\/>/.test(login)
     && /useIsLive\(\)/.test(login),
    'the login route chooses either the live gateway or the sample persona chooser');
  ok(/autoComplete="email"/.test(livePages) && /autoComplete="current-password"/.test(livePages),
    'the live gateway asks for e-mail and password');
  // The tutorial hosts moved out of the layout into components/TutorialExtras,
  // because the layout is a server component and could therefore only ever read
  // a build-time flag — which meant that on a church's deployment the guided
  // walk could not appear no matter what the visitor chose. The guarantee being
  // asserted is the same one: they render in tutorial mode and nowhere else.
  const extras = exists('components/TutorialExtras.tsx')
    ? read('components/TutorialExtras.tsx') : '';
  ok(/<TutorialExtras\s*\/>/.test(layout)
     && /<TutorialHost\s*\/>/.test(extras)
     && /if\s*\(!tutorial\)\s*return null;/.test(extras),
    'the tutorial host renders only in sample-data mode');
  // And the mode can only ever move in the safe direction: asking for the
  // tutorial must not be able to switch a database on, and a deployment with no
  // keys must not be able to leave the tutorial.
  const tutorialMode = exists('lib/tutorial.tsx') ? read('lib/tutorial.tsx') : '';
  ok(/live:\s*IS_LIVE\s*&&\s*!tutorial/.test(tutorialMode),
    'live mode still requires the deployment to actually have a database');
  ok(/auth\.updateUser\(\{[\s\S]{0,120}password/.test(livePages),
    'an invitation link sets a password on the invited account');
  ok(/router\.replace\(`\/join\$\{query\}\$\{hash\}`\)/.test(livePages),
    'a mail callback landing at the site root is routed to the password screen');
}

// ---------------------------------------------------------------------------
// 13. Invitations cannot outrun approval or mint leadership.
//
// Screen checks are useful feedback, not security. These assertions keep the
// role boundary and the approval gate in the SQL that every Data API write has
// to cross, including a hand-written request that never opens the app.
// ---------------------------------------------------------------------------
if (exists('supabase/migrations/0003_invite_approval_gate.sql')) {
  const gate = read('supabase/migrations/0003_invite_approval_gate.sql');
  ok(/v_invite\.church_id,\s*false,\s*v_invite\.recommended_by/s.test(gate),
    'an invited account starts unapproved');
  ok(/validate_invite_privilege/.test(gate) && /new\.role = 'executive'/.test(gate),
    'the database refuses invitations that mint an Executive Director');
  ok(/new\.role = 'admin' and v_inviter\.role <> 'executive'/.test(gate),
    'only an Executive Director may invite a Director');
  ok(/pair_recommended_explorer_after_approval/.test(gate) && /not old\.is_approved\s+and new\.is_approved/.test(gate),
    'a recommended Explorer is paired only after approval');
  const redemption = gate.slice(gate.indexOf('create or replace function public.handle_new_user'),
    gate.indexOf('-- A Director may approve'));
  ok(!/insert into public\.pairings/.test(redemption),
    'invitation redemption itself creates no pre-approval pairing');
}

if (exists('supabase/functions/invite/index.ts')) {
  const inviteFunction = read('supabase/functions/invite/index.ts');
  // SITE_URL now comes through setting(), which reads the environment first and
  // falls back to a service-role-only table — so a church that cannot reach the
  // Edge Functions screen can still configure email. What is being protected is
  // unchanged and is what this asserts: the address in an invitation is either
  // configured deliberately or is the calling origin AFTER safeOrigin has
  // validated it. An unvalidated header would let a caller point a real
  // church's invitations at a site of their choosing.
  ok(/safeOrigin\(await setting\(admin, 'SITE_URL'\)\) \|\| safeOrigin\(req\.headers\.get\('Origin'\)\)/.test(inviteFunction),
    'invitation links use the stable site URL or the validated calling origin');
  // And the fallback store must never be readable by a browser.
  ok(/revoke all on public\.app_settings from public/.test(read('supabase/migrations/0014_mail_settings_fallback.sql') || ''),
    'the mail settings fallback is revoked from PUBLIC, not just anon');
}

if (exists('supabase/migrations/0004_live_api_permissions.sql')) {
  const permissions = read('supabase/migrations/0004_live_api_permissions.sql');
  ok(/revoke all on table public\.profiles from anon/.test(permissions),
    'anonymous visitors receive no profile table privilege');
  ok(/grant select, update on table public\.profiles to authenticated/.test(permissions),
    'signed-in profiles can be read and approved under RLS');
  ok(/grant select, insert, update on table public\.messages to authenticated/.test(permissions),
    'signed-in pairing members can use messages under RLS');
  ok(/alter publication supabase_realtime add table public\.messages/.test(permissions),
    'live message delivery is enabled once and idempotently');
  ok(/revoke all on function public\.handle_new_user\(\) from public, anon, authenticated/.test(permissions),
    'the auth trigger cannot be called as a public RPC');
}

if (exists('supabase/migrations/20260816130240_approval_revocation_gate.sql')) {
  const revocation = read('supabase/migrations/20260816130240_approval_revocation_gate.sql');
  ok(/create or replace function public\.is_approved_user\(\)/.test(revocation),
    'approval revocation has one caller-scoped database gate');
  ok(/and is_approved/.test(revocation) && /role = 'admin' and is_approved/.test(revocation),
    'disapproved leadership immediately loses leadership authority');
  ok(/create or replace function public\.in_pairing\(p uuid\)[\s\S]*select public\.is_approved_user\(\)/.test(revocation),
    'the pairing helper used by message policies refuses disapproved callers');
  ok(/create policy pairings_read[\s\S]*public\.is_approved_user\(\)/.test(revocation),
    'a disapproved pairing member cannot read a pairing directly');
  ok(/create policy journey_write[\s\S]*public\.is_approved_user\(\)/.test(revocation),
    'a disapproved Guide cannot append journey history');
  ok(/revoke all on function public\.is_approved_user\(\) from public, anon/.test(revocation),
    'the approval helper is never callable anonymously');
}

// ---------------------------------------------------------------------------
// 14. Password sign-in crosses one same-origin, non-cacheable boundary.
//
// A browser privacy shield can refuse a cross-origin Auth request before it
// reaches Supabase. The server route keeps the credential exchange same-origin,
// writes the caller-scoped session cookies, and never imports a privileged key.
// Login responses are private and non-cacheable so a CDN can never replay one
// person's session to somebody else.
// ---------------------------------------------------------------------------
if (exists('app/api/auth/sign-in/route.ts')) {
  const signInRoute = read('app/api/auth/sign-in/route.ts');
  const liveData = read('lib/live/data.ts');
  ok(/createServerClient/.test(signInRoute) && /request\.cookies\.getAll\(\)/.test(signInRoute),
    'the sign-in route uses a request-scoped cookie client');
  ok(/headers\.set\(['"]Cache-Control['"],\s*['"]private, no-store/.test(signInRoute),
    'sign-in responses are private and never cacheable');
  ok(/origin\s*&&\s*origin\s*!==\s*request\.nextUrl\.origin/.test(signInRoute),
    'cross-site login requests are refused');
  ok(!PRIVILEGED.test(signInRoute),
    'the sign-in route names no service-role or other privileged key');
  ok(/session:\s*authData\.session/.test(signInRoute),
    'the same-origin gateway returns only the verified session needed by the browser');
  ok(/fetch\('\/api\/auth\/sign-in'/.test(liveData) && /credentials:\s*'same-origin'/.test(liveData),
    'the browser sends credentials only to Hope Beacon itself');
  const browserClient = read('lib/supabase/client.ts');
  ok(/saveBrowserSession\(payload\.session/.test(liveData) &&
      /localStorage\.setItem/.test(browserClient) && /localStorage\.getItem/.test(browserClient),
    'the browser saves and confirms the verified session before navigation');
  // THE PROPERTY IS "no second Auth round trip", NOT ONE PARTICULAR LINE.
  //
  // This used to match `accessToken: async () => readBrowserSession(...)`
  // exactly, and that spelling had to change: handing over the STORED token
  // forever is what expired every session after an hour, so the callback now
  // refreshes when the token is about to lapse. It still never asks Auth who
  // the user is; it reads the same first-party session and, at most, trades a
  // refresh token the browser already holds.
  //
  // So the check moved to the two things that actually matter: the token comes
  // from the stored session, and nothing calls getUser().
  ok(/accessToken:\s*liveAccessToken/.test(browserClient)
      && /function liveAccessToken/.test(browserClient)
      && /readBrowserSession\(\)/.test(browserClient),
    'the data client takes its token from the stored first-party session');
  ok(!/auth\.getUser\(\)/.test(liveData) && !/auth\.getUser\(\)/.test(browserClient),
    'live data uses the verified first-party session without a second Auth round trip');
}

// ---------------------------------------------------------------------------
// 15. A link never renders inside a button.
//
// <Linked> turns text somebody typed into anchors. Drop it into a surface that
// is itself a control and the result is an <a> inside a <button>: invalid HTML,
// and a tap that either navigates away or is swallowed depending on the
// browser. It happened once already, in the lesson picker — the row is a toggle
// for building a series, so a link in it would have thrown away a half-built
// series on a mistap.
//
// This is not stored XSS; it is the failure mode that comes free with the fix
// for stored XSS, which is why it is written down next to it. The check counts
// unclosed <button> tags before each <Linked>, which is crude but catches the
// only shape this mistake takes.
// ---------------------------------------------------------------------------
{
  // Blank out comments before counting, keeping every character position — a
  // comment that MENTIONS <Linked> or <button> must not be mistaken for one.
  // Replacing with equal-length spaces means the line numbers reported below
  // still point at the real source. (The first version of this check flagged
  // the comment explaining why the lesson picker does not use <Linked>.)
  const decomment = (src) =>
    src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

  const offenders = [];
  for (const file of sources) {
    const src = decomment(read(file));
    let at = src.indexOf('<Linked');
    while (at !== -1) {
      const before = src.slice(0, at);
      const opens = (before.match(/<button\b/g) || []).length;
      const closes = (before.match(/<\/button>/g) || []).length;
      if (opens > closes) offenders.push(`${file}:${before.split('\n').length}`);
      at = src.indexOf('<Linked', at + 1);
    }
  }
  ok(
    offenders.length === 0,
    offenders.length === 0
      ? 'no <Linked> renders inside a <button>, so no anchor is nested in a control'
      : `<Linked> is inside a <button> at ${offenders.join(', ')} — the link cannot be tapped and the control breaks`,
  );
}

// ---------------------------------------------------------------------------
// 16. Nothing calls crypto.randomUUID() directly.
//
// It is a SECURE-CONTEXT api. It is undefined over plain http on a LAN address,
// which is exactly how a church first tries the app on its own office network,
// and absent in Safari before 15.4. Unguarded it does not degrade, it throws,
// so whatever the caller was doing fails outright.
//
// lib/uuid.ts exists for this and falls back to crypto.getRandomValues, which
// has no such restriction. lib/localMedia.ts used it. lib/live/data.ts did not,
// and the call sat on the live media upload path, so sending a photo threw on
// any device without it. A helper that some call sites skip is not a fix, which
// is why this is a test rather than a comment.
// ---------------------------------------------------------------------------
{
  const strip = stripTs;

  const offenders = [];
  for (const file of sources) {
    if (file === path.join('lib', 'uuid.ts')) continue; // the one place it belongs
    const src = strip(read(file));
    const at = src.indexOf('crypto.randomUUID');
    if (at !== -1) offenders.push(`${file}:${src.slice(0, at).split('\n').length}`);
  }
  ok(
    offenders.length === 0,
    offenders.length === 0
      ? 'crypto.randomUUID is called only inside lib/uuid.ts, which guards it'
      : `crypto.randomUUID called directly at ${offenders.join(', ')} — throws on plain http and on Safari before 15.4`,
  );
  // And the guard itself must still be there to be worth pointing at.
  if (exists('lib/uuid.ts')) {
    const u = read('lib/uuid.ts');
    ok(/getRandomValues/.test(u), 'lib/uuid.ts falls back to crypto.getRandomValues');
    ok(/typeof c\.randomUUID === 'function'/.test(u),
       'lib/uuid.ts checks for randomUUID rather than assuming it');
  }
}

// ---------------------------------------------------------------------------
// 17. A file input is never cleared before its File has been read.
//
// WebKit invalidates a File object once the input that produced it is reset.
// Every one of these handlers reads the bytes asynchronously -- into IndexedDB,
// into Supabase Storage, through file.text() -- so clearing `value` first
// aborted the read on Safari and iOS while working perfectly in Chromium.
//
// It failed invisibly, which is why it survived. The attachment row is added
// optimistically and removed when the write fails, so the file appeared in the
// conversation and then vanished with no error. Four call sites had it: the
// demo chat, the LIVE conversation, the media library and the backup restore.
// The first WebKit CI run failed all six device profiles on it.
//
// The reset is legitimate -- without it, choosing the same file twice fires no
// change event -- so the fix is to move it, not delete it: clear when the
// picker OPENS, or in a finally after the bytes are read.
// ---------------------------------------------------------------------------
{
  const strip = stripTs;

  const offenders = [];
  for (const file of sources) {
    const src = strip(read(file));
    // The shape of the bug: a File is taken out of the event, and the very
    // next statement clears the input it came from.
    const re = /\.files\s*(\?)?\.?\[0\]|\.files\s*\?\?\s*\[\]|Array\.from\(\s*\w+\.files/g;
    let m;
    while ((m = re.exec(src))) {
      // Look at the next 200 characters only. A reset further away is the
      // deliberate late one this rule is asking for.
      const after = src.slice(m.index, m.index + 200);
      if (/\.value\s*=\s*''|\.value\s*=\s*""/.test(after)) {
        offenders.push(`${file}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
  }
  ok(
    offenders.length === 0,
    offenders.length === 0
      ? 'no file input is cleared before its File has been read'
      : `a file input is cleared right after the File is taken at ${offenders.join(', ')} — the read aborts on WebKit`,
  );
}

// ---------------------------------------------------------------------------
// 18. The clipboard is touched in one place.
//
// `navigator.clipboard` is UNDEFINED in a non-secure context, so over plain
// http on an office LAN the property access itself throws. Safari additionally
// rejects the write when the document is not focused.
//
// Four call sites did `void navigator.clipboard?.writeText(x)`. The `void`
// discards the promise, so a rejection became an unhandled rejection nobody
// saw, and the person who pressed Copy got no clipboard and no message. Two
// others said "Copied" whether or not it had worked, which is worse than
// silence: it is the app telling somebody their link is on the clipboard when
// it is not.
//
// lib/share.ts's copyText() guards the API, falls back to execCommand where the
// modern one is unavailable, and returns a boolean the caller must look at.
// ---------------------------------------------------------------------------
{
  const strip = stripTs;

  const offenders = sources.filter(
    (f) => f !== path.join('lib', 'share.ts') && /navigator\.clipboard/.test(strip(read(f))),
  );
  ok(
    offenders.length === 0,
    offenders.length === 0
      ? 'navigator.clipboard is used only inside lib/share.ts, which guards it'
      : `navigator.clipboard used directly in ${offenders.join(', ')} — throws over plain http and fails silently on Safari`,
  );
  if (exists('lib/share.ts')) {
    const sh = read('lib/share.ts');
    ok(/export async function copyText/.test(sh), 'lib/share.ts exports copyText');
    ok(/execCommand\('copy'\)/.test(sh), 'copyText falls back where the modern API is missing');
    // The fallback builds a textarea. It must set .value, never innerHTML, or
    // the text being copied becomes a way to inject markup. Checked against the
    // stripped source: the comment that EXPLAINS the rule contains the word,
    // and tripped this on its first run.
    ok(!/innerHTML/.test(strip(sh)), 'the copy fallback never assigns innerHTML');
  }
}

// ---------------------------------------------------------------------------
// 19. The safeguarding columns stay privileged, and the roster stays closed.
//
// A minor's guardian record is the one thing in this schema a person must not
// be able to write about themselves. A fifteen year old who can set their own
// guardian_consent_at has a consent box, not a safeguard, and the whole value
// of the record is that somebody ELSE checked the letter.
//
// The roster is the other half: it lists, by name and birthday, every child in
// a congregation. That is the most sensitive query in the app, and it must be
// reachable only by somebody who runs that church.
// ---------------------------------------------------------------------------
{
  const guardianMig = ['supabase/migrations/0033_a_minor_is_walked_with_differently.sql',
                       'supabase/migrations/0034_the_directors_roster_of_minors.sql']
    .filter(exists).map(read).join('\n');

  ok(guardianMig.length > 0, 'the guardian-consent migrations are present');

  if (guardianMig) {
    // Every guardian column named in the self-edit refusal.
    for (const col of ['guardian_name', 'guardian_consent_at', 'guardian_consent_by',
                       'guardian_member_id']) {
      ok(new RegExp(`new\\.${col} is distinct from old\\.${col}`).test(guardianMig),
         `${col} is refused as a self-edit`);
      ok(new RegExp(`new\\.${col}\\s*:=\\s*old\\.${col}`).test(guardianMig),
         `${col} is pinned for callers who are not leadership`);
    }

    // Recording is leadership-only and cannot target yourself.
    ok(/record_guardian_consent[\s\S]*?is_admin\(\) or public\.is_executive\(\)/.test(guardianMig),
       'recording guardian consent is leadership-only');
    ok(/Somebody else has to record consent for you/.test(guardianMig),
       'and a person cannot record their own');

    // A child cannot be recorded as another child's responsible adult.
    ok(/is_minor\(guardian_birthday\)/.test(guardianMig),
       'a minor cannot be recorded as a guardian');
    ok(/cannot be their own guardian/.test(guardianMig),
       'and nobody is their own guardian');

    // The roster is scoped to a church the caller actually runs.
    ok(/minors_in_church[\s\S]*?manages_church/.test(guardianMig),
       'the minors roster is limited to a church the caller runs');
    ok(/revoke all on function public\.minors_in_church\(uuid\) from anon/.test(guardianMig),
       'the minors roster is closed to anonymous callers');

    // Derived, never stored. A stored flag is wrong from the morning of the
    // eighteenth birthday and nothing announces it.
    ok(!/add column if not exists is_minor|add column if not exists minor\b/.test(guardianMig),
       'minor status is computed, never stored as a column that can go stale');
    ok(/create or replace function public\.is_minor\(p_birthday date\)[\s\S]*?stable/.test(guardianMig),
       'is_minor is STABLE, because the answer changes with the date');
  }
}

// ---------------------------------------------------------------------------
// 20. The MINOR badge is on the screens where somebody is responsible.
//
// A safeguarding mark that a person has to go looking for is one nobody sees.
// The badge has to be next to the name on all three surfaces where an adult is
// responsible for that child:
//
//   the Guide's list of their Explorers
//   the conversation itself, which is where a Guide actually spends their time
//   the Director's list of pairings
//
// Both the Guide and the Director see it, including the "consent missing"
// state: the Guide is the adult in the room, and a warning only a Director can
// see is a warning that arrives after the conversation, not before it.
//
// This is a placement check, and placement is exactly the thing a refactor
// removes without noticing.
// ---------------------------------------------------------------------------
if (liveScreens()) {
  const live = liveScreens();
  const badges = (live.match(/<MinorBadge\b/g) || []).length;
  ok(badges >= 3,
     `the MINOR badge is on all three responsible surfaces (found ${badges})`);
  ok(/import \{ MinorBadge \}/.test(live), 'and it is really the badge component');

  // It needs the data to draw, and the pairing query has to carry it.
  if (exists('lib/live/data.ts')) {
    const data = read('lib/live/data.ts');
    // THE PROPERTY IS THE TWO COLUMNS, NOT THE EXACT LIST. Pinned to the
    // literal string, this failed the first time a column was ADDED to the
    // same select, which is a change that cannot break the badge. What breaks
    // it is either column going missing, so that is what is checked.
    const pairingSelect = /\.select\('([^']*full_name[^']*)'\)/.exec(data)?.[1] ?? '';
    ok(/\bbirthday\b/.test(pairingSelect) && /\bguardian_consent_at\b/.test(pairingSelect),
       `the pairing query asks for the birthday and consent the badge needs (${pairingSelect || 'no select found'})`);
    ok(/ds_birthday/.test(data) && /ds_guardian_consent_at/.test(data),
       'and carries them through to the screen');
  }
}

// The badge itself must keep both states distinct. One state means a minor with
// consent on file, which is a fact; the other means nobody has recorded a
// letter, which is a job. Collapsing them hides the job.
if (exists('lib/minor.ts')) {
  const minor = read('lib/minor.ts');
  ok(/'missing'/.test(minor) && /'ok'/.test(minor) && /'none'/.test(minor),
     'minor state keeps "consent missing" separate from "consent on file"');
  ok(!/add column .*is_minor|isMinorStored/.test(minor),
     'and minor status is still derived rather than stored');
}

// ---------------------------------------------------------------------------
// 21. The one function holding service_role decides who may read its replies.
//
// supabase/functions/invite holds the service_role key -- the single credential
// that bypasses every row level security policy in the project. Its replies
// contain a working join link, so "any website may read this" is not a sentence
// to leave lying around.
//
// The wildcard was never the authorisation: the function verifies the caller's
// token and refuses anybody who is not leadership, and the token lives in
// localStorage rather than a cookie, so a browser never attaches it to a
// cross-site request by itself. This is depth, not the only lock. It still
// costs one environment variable.
//
// The rule is that the decision is made ONCE. Nineteen `return json(...)` paths
// with a per-call-site header is a rule one of them eventually forgets.
// ---------------------------------------------------------------------------
if (exists('supabase/functions/invite/index.ts')) {
  const fn = read('supabase/functions/invite/index.ts');

  ok(/BEACON_ALLOWED_ORIGINS/.test(fn),
     'the invite function reads an origin allowlist');
  ok(/'Vary': 'Origin'/.test(fn),
     'and sets Vary: Origin, so no cache hands one origin the other’s reply');

  // Exactly one place may name the header.
  const headerSites = (fn.match(/'Access-Control-Allow-Origin'/g) || []).length;
  ok(headerSites === 1,
     `Access-Control-Allow-Origin is set in exactly one place (found ${headerSites})`);

  // And a bare wildcard must only ever appear as the documented fallback,
  // never as the literal value of that header.
  ok(!/'Access-Control-Allow-Origin':\s*'\*'/.test(fn),
     'the wildcard is not hardcoded as the header value');

  // The caller is still checked. If this ever goes, the allowlist is decoration.
  ok(/auth\.getUser\(/.test(fn), 'the invite function still verifies the caller');
  ok(/role !== 'admin' && me\.role !== 'executive'|!== 'admin'[\s\S]{0,80}!== 'executive'/.test(fn),
     'and still refuses anybody who is not leadership');
}

// ---------------------------------------------------------------------------
// 22. A church may have more than one real address, but never a deployment URL.
//
// Two failures pull in opposite directions here and both are real.
//
// Permit only ONE canonical host and the day a custom domain becomes production
// is the day everybody still on the old address loses the install button and is
// told by Settings they are on a preview that "can never receive an update".
// That is false -- both addresses serve the same deployment and both keep
// updating -- and it is aimed at whoever installed earliest.
//
// Permit ANY host and the protection is gone: every deployment gets its own
// permanent URL, an app installed from one can genuinely never update, and
// somebody who shares that link hands a frozen copy to a congregation.
//
// So: a list, checked by exact host match, and a preview build still refuses
// outright whatever is in it.
// ---------------------------------------------------------------------------
if (exists('lib/canonical.ts')) {
  const c = read('lib/canonical.ts');
  ok(/CANONICAL_HOSTS/.test(c), 'canonical host is a list, so a domain move does not orphan the old address');
  ok(/CANONICAL_HOSTS\.includes\(window\.location\.host\)/.test(c),
     'and membership is an exact host match, not a substring or a suffix');
  ok(/BUILD_ENV === 'preview'/.test(c),
     'a preview build is still refused outright, whatever the list says');
  // A suffix test would make evil-yourchurch.org canonical.
  ok(!/endsWith\(|includes\(CANONICAL|indexOf\(CANONICAL/.test(c),
     'no suffix or substring matching, which would make a lookalike domain canonical');
}

// ---------------------------------------------------------------------------
// AND NO SCREEN MAY ANSWER THAT QUESTION FOR ITSELF.
// ---------------------------------------------------------------------------
//
// The list above is only the answer if every caller asks it, and one did not.
// components/WhichApp.tsx -- the single screen that tells a person in red to
// UNINSTALL what they are looking at -- compared window.location.host against
// the SINGULAR CANONICAL_HOST. lib/canonical.ts had already been widened to a
// list precisely because a domain move is not an instant; that screen never
// learned it.
//
// So the day a second host was added, every person still on the first address
// would have been told their install was a dead deployment that could never
// update. False, and aimed at whoever installed earliest -- which is the exact
// failure the list exists to prevent, arriving through the one screen that
// states it out loud.
//
// It was found while planning the move, not by this file, because this file
// only ever read the helper. A rule that checks the helper and not its callers
// is a rule about a file rather than about the app.
{
  const strip = stripTs;
  const offenders = sources
    .filter((f) => f !== 'lib/canonical.ts' && f !== 'lib/build-info.ts')
    .filter((f) => /(!==|===)\s*CANONICAL_HOST\b|\bCANONICAL_HOST\s*(!==|===)/.test(strip(read(f))));
  ok(offenders.length === 0,
     'no screen compares the address against the single canonical host itself'
     + (offenders.length ? ` (${offenders.join(', ')}) -- ask onCanonicalHost(), which knows about the list` : ''));
}
if (exists('scripts/stamp-build.mjs')) {
  const st = read('scripts/stamp-build.mjs');
  ok(/split\(','\)/.test(st), 'the build stamp accepts several hosts');
  // VERCEL_URL is the PER-DEPLOYMENT url. If it ever reaches the list, every
  // deployment becomes installable and the frozen-copy bug is back.
  ok(!/env\.VERCEL_URL/.test(st),
     'the per-deployment URL is never treated as canonical');
}

// ---------------------------------------------------------------------------
// 23. A successful send must not mint a second token.
//
// This is the bug that made EVERY invitation arrive dead, and it is subtle
// enough to be reintroduced by anybody trying to be helpful.
//
// auth.users holds one confirmation_token and one recovery_token. They are
// slots, not collections. inviteUserByEmail / resetPasswordForEmail each mint a
// token, write it to the slot, and email it. Calling generateLink afterwards
// mints another token for the same purpose and overwrites the slot, so the
// token already sitting in the recipient's inbox is dead on arrival and /join
// shows "this invitation link has expired or has already been used".
//
// The old code did exactly that on every call, in the name of always handing
// the Director a spare link -- a link both screens then ignored, because they
// read it only when delivery === 'link'. It destroyed the working token for
// nobody's benefit.
//
// The property, stated so it survives rewording: generateLink is reachable ONLY
// under a send-failure branch. Negative control: moving the call back out to
// the top level fails this.
// ---------------------------------------------------------------------------
if (exists('supabase/functions/invite/index.ts')) {
  const fn = read('supabase/functions/invite/index.ts');

  // Blank comments but keep line numbers, so prose about the bug cannot satisfy
  // or trip the checks that follow. This scanner has caught its own commentary
  // twice before.
  const code = fn
    .split('\n')
    .map((line) => (/^\s*(\/\/|\*|\/\*)/.test(line) ? '' : line))
    .join('\n');

  // THE PROPERTY IS ORDERING, NOT LOCATION, AND THE FIRST TWO VERSIONS OF THIS
  // CHECK BOTH GOT IT WRONG IN DIFFERENT DIRECTIONS.
  //
  // v1 asked whether an `if (sendError)` appeared anywhere before generateLink.
  // One always does -- the block that rewrites the four refusal messages sits
  // between the send and this point -- so the negative control passed with the
  // bug fully restored.
  //
  // v2 demanded that EVERY generateLink sit inside an `if (sendError)` block.
  // That failed the moment the Brevo path was added, correctly by its own
  // wording and wrongly in substance: on that path generateLink is the ONLY
  // mint, it runs before anything is emailed, and Supabase sends nothing at
  // all. Nothing is being overwritten there.
  //
  // What actually causes a dead link in somebody's inbox is minting a token
  // AFTER Supabase Auth has already emailed one. So a generateLink call is safe
  // when either:
  //   * it runs BEFORE the first Supabase send in the file (the Brevo path, and
  //     any future path that composes its own message), or
  //   * it is enclosed by an `if (sendError)` block (the hand-over fallback,
  //     where no mail went and there is no token in an inbox to protect).
  // Match `if (sendError` as a PREFIX. The guard grew a second condition
  // (`&& !joinUrl`) when the Brevo path started arriving here with a link it
  // had already minted, and an exact-string matcher silently stopped finding
  // the block -- reporting the fallback as unguarded when it is guarded.
  const blocks = [];
  for (let i = code.indexOf('if (sendError'); i !== -1; i = code.indexOf('if (sendError', i + 1)) {
    const open = code.indexOf('{', i);
    if (open === -1) continue;
    let depth = 0;
    for (let j = open; j < code.length; j++) {
      if (code[j] === '{') depth++;
      else if (code[j] === '}') {
        depth--;
        if (depth === 0) { blocks.push([open, j]); break; }
      }
    }
  }

  const firstSupabaseSend = Math.min(
    ...['inviteUserByEmail', 'resetPasswordForEmail']
      .map((n) => code.indexOf(n))
      .filter((i) => i !== -1)
      .concat([Number.MAX_SAFE_INTEGER]),
  );
  ok(firstSupabaseSend !== Number.MAX_SAFE_INTEGER,
     'Supabase Auth is still a send path, so the ordering rule has something to order against');

  const mints = [];
  for (let i = code.indexOf('generateLink'); i !== -1; i = code.indexOf('generateLink', i + 1)) mints.push(i);

  // THE INVARIANT IS SATISFIED IN ITS STRONGEST FORM NOW: nothing is minted at
  // all, so no emailed token can be overwritten by a later one.
  //
  // The invitation carries a PASSWORD. The account is created with one before
  // the message leaves and the address in the message is the ordinary sign-in
  // page, so there is no single-use slot to race. Every failure mode this
  // invariant was written to prevent -- the dead link, the scanner that spends
  // it, the second tap that fails -- needs a token to exist first.
  //
  // The ordering rule is KEPT rather than deleted, because it is the correct
  // rule the day anybody reintroduces a token for any reason, and that day will
  // arrive with no memory of why it mattered.
  if (mints.length === 0) {
    ok(true, 'no one-time token is minted anywhere, so none can ever be overwritten');
  } else {
    const unsafe = mints.filter((i) =>
      i > firstSupabaseSend && !blocks.some(([a, b]) => i > a && i < b));
    ok(unsafe.length === 0,
       'no token is minted after a Supabase send except under a sendError guard'
       + (unsafe.length ? ` (${unsafe.length} unguarded)` : ''));
  }

  // THE SUCCESS REPLY MAY NOW CARRY A LINK, and the reason it was once
  // forbidden is worth keeping. Producing a link used to MINT a token, so
  // returning one after a successful send killed the token already in the
  // recipient's inbox. Returning a sign-in address costs nothing, because it
  // is a fact about where to go rather than a credential.
  //
  // What must never come back is a token. That is the check now.
  const successReturn = code.slice(code.lastIndexOf("delivery: 'email'"));
  ok(!/token_hash|hashed_token/.test(successReturn),
     'and no reply carries a one-time token');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);

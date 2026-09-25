// The promise this project makes, checked rather than asserted in a README.
//
// Open Sentry Beacon says three things about itself. Each one is easy to break
// with a single well-meaning commit, and each one is the reason somebody would
// trust it with a congregation's names:
//
//   1. IT SHIPS NO KEYS, AND RUNS WITH NO CONFIGURATION. Clone it and it works
//      — a sample church, in the browser, with nothing to sign up for. Point it
//      at your own database and it becomes real. Neither the keys nor the
//      hostnames of anybody else's deployment are in here.
//   2. IT PHONES NOBODY. No analytics, no error reporting, no telemetry, no
//      "anonymous usage statistics". A church's activity is the church's.
//   3. IT CARRIES NOBODY'S PIPELINE. This repository was extracted from a
//      private one that has deployment monitoring, status notifications and its
//      own reporting workflow. None of that belongs to the people who fork this,
//      and some of it would quietly report to somebody else's systems.
//
// ---------------------------------------------------------------------------
// RULE 1 CHANGED ON 2026-08-15, DELIBERATELY, AND THIS NOTE IS THE RECORD.
//
// It used to read "IT HAS NO BACKEND", and it was enforced by banning
// @supabase/* as a dependency outright. That made the project honest and also
// made it a dead end: the whole point of releasing Hope Beacon is that another
// Adventist developer can stand up their OWN, and a project that forbids the
// database SDK can never be the thing they run for a real congregation.
//
// What actually protected people was never the absence of a backend. It was
// the absence of SOMEBODY ELSE'S backend — no keys, no hostnames, no pipeline
// reporting to a stranger's systems. Those are all still enforced below, and
// more strictly than before.
//
// The zero-configuration promise is enforced too, and that is the half people
// forget: a fork must still run with no database at all, because "clone it and
// look at it" is what lets a church evaluate this before committing to
// anything. Requiring a Supabase project to see the app would quietly kill
// that, and no dependency check would notice.
//
// Changed with the owner's explicit decision. If you are reading this because
// you want to put the old rule back, the question to ask first is which of the
// two promises you are protecting — because they are not the same promise.
//
//   node tests/no-backend.js
//
// Plain Node, no dependencies. Exits non-zero on any violation.
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

let tracked = [];
try {
  tracked = execSync('git ls-files', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
} catch {
  console.log('BAD not a git repository');
  process.exit(1);
}
ok(tracked.length > 20, `${tracked.length} tracked files to check`);

// `git ls-files` reports the INDEX, which can name a file that is no longer on
// disk — delete a staged file and it is still listed. Reading it then throws a
// stack trace that looks like a broken test rather than what it is. Say so
// plainly instead, and carry on checking everything that does exist.
const missing = tracked.filter((f) => !fs.existsSync(path.join(root, f)));
ok(
  missing.length === 0,
  missing.length
    ? `tracked but not on disk: ${missing.join(', ')} — run \`git add -A\``
    : 'every tracked file is on disk',
);
tracked = tracked.filter((f) => !missing.includes(f));

const source = tracked.filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f));

// Rule 1 needs the text files before rule 3 defines them. A function rather
// than a hoisted const, so the two cannot drift apart.
const textFilesEarly = () =>
  tracked.filter(
    (f) => !/package-lock\.json|\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?)$/.test(f),
  );

// ---------------------------------------------------------------------------
// 1. No keys, and it still runs with nothing configured.
//
// A database SDK is now allowed — see the note at the top. What is not allowed
// is a credential, or a default that points somewhere real, or an app that
// refuses to start until somebody signs up for something.
// ---------------------------------------------------------------------------
const pkg = JSON.parse(read('package.json'));

// The app must be able to boot with the environment completely empty. The way
// that is guaranteed is that every read of a backend variable has a fallback
// and nothing throws on absence — so a bare `process.env.X!` (non-null
// assertion) or a `throw` when a key is missing is the thing to catch.
const envReads = [];
for (const f of source) {
  if (f.startsWith('tests/')) continue;
  read(f)
    .split('\n')
    .forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (/process\.env\.NEXT_PUBLIC_SUPABASE[A-Z_]*!/.test(line)) {
        envReads.push(`${f}:${i + 1} asserts a key is present with !`);
      }
      if (/throw[^\n]*(SUPABASE|environment variable|is required)/i.test(line)) {
        envReads.push(`${f}:${i + 1} throws when a key is missing`);
      }
    });
}
ok(
  envReads.length === 0,
  envReads.length === 0
    ? 'nothing demands a backend variable — the app runs with an empty environment'
    : `the app will not start without configuration: ${envReads.join('; ')}`,
);

// A committed key is the failure this whole file exists to prevent. Checked by
// SHAPE rather than by name, because the next key will be called something
// nobody has thought of yet: a Supabase anon/service JWT is three dot-separated
// base64url runs beginning `eyJ`.
const keyish = [];
for (const f of textFilesEarly()) {
  read(f)
    .split('\n')
    .forEach((line, i) => {
      if (/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(line)) {
        keyish.push(`${f}:${i + 1}`);
      }
    });
}
ok(
  keyish.length === 0,
  keyish.length === 0
    ? 'no JSON Web Token is committed anywhere'
    : `something shaped exactly like a key is committed at: ${keyish.join(', ')}`,
);

// `.env.example` teaches the shape and must never carry a value.
if (tracked.includes('.env.example')) {
  const filled = read('.env.example')
    .split('\n')
    .filter((l) => /^[A-Z_]+=.+/.test(l) && !/^[A-Z_]+=\s*(#|$)/.test(l))
    .filter((l) => !/=\s*(your-|<|\.\.\.|example|changeme|placeholder)/i.test(l));
  ok(
    filled.length === 0,
    filled.length === 0
      ? '.env.example names the variables and sets none of them'
      : `.env.example has real values in it: ${filled.join(' | ')}`,
  );
}

// API routes still have to earn their place. Two stateless ones plus, now, the
// ones a real deployment genuinely needs — each named, so a new server route
// is a decision somebody makes on purpose rather than a thing that appears.
const routes = tracked.filter((f) => /^app\/.*\/route\.(ts|js)$/.test(f));
// Each of these is a server route somebody had to justify, which is the point
// of the list: adding one is a decision, not a drive-by.
//
//   app/sw.js/route.ts          serves the service worker from this origin.
//   app/version.json/route.ts   the app asking itself what build it is serving.
//   app/api/auth/sign-in/route.ts
//       The first-party sign-in gateway. It exists so the browser sends a
//       password to Hope Beacon's own origin and never to a third party, and it
//       returns only the verified session — which is exactly what the checks in
//       tests/security-invariants.mjs assert about it. It arrived with the live
//       session handoff and was never added here, so this suite had been failing
//       on a route the rest of the suite treats as required.
//
//   app/api/app-icon/route.ts
//       Fetches the logo of a web app somebody saved in their pocket, and it
//       exists SO THAT the browser does not. A tile pointing straight at
//       faithlife.com/favicon.ico would need img-src widened to arbitrary
//       origins for every page in the app, and would tell that company a church
//       member is on their screen -- with their IP -- every time the rail
//       renders. Fetched here, the policy stays as narrow as it was and the
//       only thing the company sees is a server asking for a picture.
//       It is a server route in the sense this file means, which is why it is
//       named here rather than waved through: it takes a URL a person typed and
//       opens it. Its fences (http(s) only via lib/url.ts, every resolved
//       address checked against the private ranges including the cloud metadata
//       address, redirects followed by hand and re-checked per hop, byte caps,
//       timeouts, images only) are asserted by
//       tests/the-pocket-keeps-a-web-app-safely.mjs, which executes the address
//       test rather than reading it.
//       It holds nothing and remembers nothing, which is what "no backend"
//       actually asks of a route.
const ALLOWED_ROUTES = [
  'app/sw.js/route.ts',
  'app/version.json/route.ts',
  'app/api/auth/sign-in/route.ts',
  'app/api/app-icon/route.ts',
];
for (const r of routes) {
  ok(
    ALLOWED_ROUTES.includes(r),
    ALLOWED_ROUTES.includes(r)
      ? `${r} is one of the stateless routes`
      : `${r} is a server route nobody has justified — add it to ALLOWED_ROUTES with a reason`,
  );
}

// ---------------------------------------------------------------------------
// 2. It phones nobody.
//
// Every outbound call in shipped code, listed. The allowed ones are: the app
// asking its OWN origin what build it is serving, and links a person clicks.
// ---------------------------------------------------------------------------
const TELEMETRY = [
  [/google-analytics|gtag\(|googletagmanager/i, 'Google Analytics'],
  [/\bmixpanel\b|\bamplitude\b|segment\.com|\bposthog\b/i, 'a product-analytics SDK'],
  // MATCHES THE SDK, NOT THE WORD. This was /\bsentry\b/ until the app was named
  // Hope Beacon, at which point every screen that says its own name looked
  // like it had shipped an error reporter -- fifty-five failures, none of them
  // real. A brand name colliding with a well-known SDK is a fact to live with;
  // a check that cannot tell them apart is not. So this looks for the things
  // only the actual SDK has: its package scope, its DSN host, its CDN, and the
  // call that starts it.
  [/@sentry\/|sentry\.io|sentry-cdn|Sentry\.init\s*\(/i, 'the Sentry error-reporting SDK'],
  [/\bbugsnag\b|\brollbar\b|\bdatadog\b/i, 'an error-reporting SDK'],
  [/vercel\/analytics|@vercel\/speed-insights/i, 'hosting analytics'],
];
let phoned = 0;
for (const f of source) {
  if (f === 'tests/no-backend.js') continue; // it must name them to find them
  const body = read(f);
  for (const [re, what] of TELEMETRY) {
    if (re.test(body)) {
      ok(false, `${f} includes ${what}`);
      phoned++;
    }
  }
}
if (phoned === 0) ok(true, 'no analytics, error reporting or telemetry anywhere');

// A fetch to an absolute URL is a call to somebody else's server. Relative ones
// are this app talking to itself, which is fine.
for (const f of source) {
  if (f.startsWith('tests/')) continue;
  const body = read(f);
  const calls = body
    .split('\n')
    // A commented example teaches; it does not call anybody.
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
    .match(/fetch\(\s*['"`]https?:\/\/[^'"`]+/g) || [];
  for (const c of calls) {
    // Its own origin during a local test run is not somebody else's server.
    if (/localhost|127\.0\.0\.1/.test(c)) continue;
    // SERVER-SIDE CODE IS NOT SHIPPED CODE. This rule protects the promise that
    // the app a visitor downloads talks to nobody — so it is about what runs in
    // a BROWSER. supabase/functions/ runs on the fork owner's own Supabase
    // project, under their own key, and one of its jobs is literally to post an
    // invitation to an email provider. Forbidding that would forbid the app
    // having invitations at all.
    //
    // The exemption is the directory, not the URL: a fork that swaps Brevo for
    // Postmark should not have to edit a test to do it. Anything under app/,
    // components/ or lib/ is still held to the original rule, which is where
    // the promise actually lives.
    if (f.startsWith('supabase/functions/')) continue;
    ok(false, `${f} fetches an external URL: ${c.slice(0, 70)}`);
  }
}
ok(true, 'no shipped code fetches an external server');

// ---------------------------------------------------------------------------
// 3. No inherited pipeline.
//
// The specific things that must never be copied back in from the private repo,
// because they report to systems that are not the fork owner's.
// ---------------------------------------------------------------------------
const FORBIDDEN_FILES = [
  [/deploy-watch/, 'deployment monitoring for somebody else’s site'],
  [/keep-warm/, 'a keep-alive for somebody else’s database'],
  [/report-status/, 'a status notifier for somebody else’s channel'],
  [/ci-report/, 'a CI notifier for somebody else’s channel'],
];
for (const [re, what] of FORBIDDEN_FILES) {
  const hit = tracked.filter((f) => re.test(f));
  ok(hit.length === 0, hit.length ? `${hit.join(', ')} is ${what}` : `nothing is ${what}`);
}

// And the words that would mean somebody's private infrastructure came along.
const FORBIDDEN_TERMS = [
  [/library[\s-]?os/i, 'a private reporting pipeline'],
  // A project host is a subdomain of supabase.co; the connection pooler is a
  // subdomain of supabase.com. Both are live database hostnames. The company's
  // own dashboard address is not one, and setup instructions have to name it.
  [/[a-z0-9-]+\.supabase\.co\b/i, 'a live database hostname'],
  [/[a-z0-9-]*\.?pooler\.supabase\.com/i, 'a live database hostname'],
  [/\.vercel\.app/i, 'a live deployment hostname'],
  [/SITE_URL|FEEDBACK_INGRESS_TOKEN|FEEDBACK_RESEND/i, 'a private deployment setting'],
  [/service[_-]?role/i, 'a privileged database key'],
];
const textFiles = tracked.filter(
  (f) => !/package-lock\.json|\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?)$/.test(f),
);
let terms = 0;
// A guardrail has to name the thing it looks for, so the guardrails are not
// scanned for their own patterns. Everything else is.
const GUARDRAILS = new Set([
  'tests/no-backend.js',
  'tests/no-secrets.js',
  'tests/security-invariants.mjs',
  // Deployment instructions must name the settings they teach, and the Edge
  // Function must name its server-only runtime variables. They remain subject
  // to the credential-shape scan above, so this permits documentation and
  // server configuration names without permitting an actual key.
  'docs/BUILD-BRIEF.md',
  'docs/DEMO-SETUP.md',
  // The handbook is the setup instructions for a church's own project. It has
  // to name SITE_URL to tell somebody where to put it, in the same way and for
  // the same reason as DEMO-SETUP.md. It carries no key, no hostname and no
  // member's name, and the credential-shape scan above still applies to it.
  'docs/HANDBOOK.md',
  'supabase/functions/invite/index.ts',
  // The notification sender, for the same reason as invite above: it runs on a
  // server, never in a browser, and the ONE caller it will accept is identified
  // by that key, so it has to name the runtime variable holding it. The
  // credential-shape scan above still applies, so naming the variable is
  // permitted and committing an actual key is still caught.
  'supabase/functions/notify/index.ts',
  // The handbook generators are documentation that happens to be JavaScript.
  // They teach an IT reader which variables to set and which key must never be
  // public, so they have to name both — the same reason DEMO-SETUP.md is here.
  // Nothing in docs/handbook/ ships to a browser or a server; it produces .docx
  // files. They stay subject to the credential-shape scan above, so naming a
  // key is permitted and carrying one is still caught.
  'docs/handbook/build-handbook.js',
  'docs/handbook/build-ai-guide.js',
  // The migration that CLOSES the privileged surface has to name the roles it
  // closes it to. A guardrail that cannot say the word it guards is not one.
  'supabase/migrations/0010_lock_definer_functions.sql',
  // 0016 GRANTS to service_role and to nothing else — that grant is the entire
  // security property of the file, since member_by_email answers "is this
  // address registered?" and is an enumeration oracle in any browser's hands.
  // Same reasoning as 0010 above: a guardrail that cannot name what it guards
  // is not one. Still subject to the credential-shape scan, so naming the role
  // is allowed and committing a key is caught.
  'supabase/migrations/0016_member_by_email_lookup.sql',
  // 0017 and 0018 each rewrite member_by_email — Postgres will not change a
  // function's OUT parameters in place, so the grant has to be restated in
  // full every time the shape changes. Each restatement is the same single
  // grant, to the same single role, guarding the same enumeration oracle, so
  // they are listed for the same reason 0016 is and under the same limits.
  'supabase/migrations/0017_invitations_with_real_status.sql',
  'supabase/migrations/0018_signing_up_is_not_opening_a_link.sql',
  // 0031 and 0032 are the anon lockdown and its correction. Both loop over
  // every function in `public` deciding which roles may execute it, so both
  // have to name the roles they grant and revoke — the same reason 0010 is on
  // this list, and the same limits: naming the role is allowed, committing a
  // key is still caught by the credential-shape scan below.
  //
  // 0032 in particular exists because 0031's blanket grant re-opened
  // member_by_email — the enumeration oracle 0016 above describes — to every
  // signed-in user. It has to name both the role and the function to say so.
  'supabase/migrations/0031_nothing_new_is_open_to_anon.sql',
  'supabase/migrations/0032_a_lockdown_must_never_widen_a_grant.sql',
  // 0033 names anon and authenticated for the same reason: it revokes its three
  // new functions from anonymous callers explicitly rather than leaving it to
  // the event trigger 0031 installed, so the intent is on the page.
  'supabase/migrations/0033_a_minor_is_walked_with_differently.sql',
  // 0034 names the roles for the same reason as 0033: it revokes the minors
  // roster from anonymous callers by name rather than relying on the event
  // trigger, because this is the most sensitive query in the schema.
  'supabase/migrations/0034_the_directors_roster_of_minors.sql',
  // .env.example's whole job is to say "never put the service_role key in
  // here". A warning that cannot name the thing it warns about is not a
  // warning, and the alternative — vaguer wording — is worse than the risk.
  //
  // The exemption is narrow and deliberately so: this skips the FORBIDDEN_TERMS
  // scan only. The checks that actually matter for this file still apply — it
  // is still scanned for a committed JSON Web Token, and still required to set
  // no values at all. Naming a key is safe; carrying one is not.
  '.env.example',
  // The two setup guides, for the same reason and under the same limits.
  // START-HERE.md is the document a church's IT volunteer is handed: it has to
  // name NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY because
  // they are the two things they must type, and it has to name the
  // service_role key because the most dangerous mistake available at that
  // moment is pasting that one instead. AI-SETUP-GUIDE.md's warning is
  // literally "no assistant needs your service_role key" — a warning that
  // cannot say the word is not a warning.
  //
  // Every hostname in both is a placeholder: `<your-ref>.supabase.co`,
  // `your-church.vercel.app`. The credential-shape scan still applies to both,
  // so naming a key stays allowed and carrying one is still caught.
  'docs/START-HERE.md',
  'docs/AI-SETUP-GUIDE.md',
  // The setup script's ONE job is refusing the privileged key, and it now has
  // to handle both formats Supabase issues — the JWT carrying a role, and the
  // sb_secret_ prefix. It cannot check for a thing it is not allowed to name,
  // for the same reason .env.example is on this list. Same limits as the rest:
  // the credential-shape scan still applies, so naming a key is permitted and
  // carrying one is still caught.
  'scripts/setup.mjs',
  // The migration that CREATES the mail settings table has to name the settings
  // it is for, or a church cannot tell what to put in it. Same limits as the
  // rest of this list: it is exempt from the TERM scan only, and the
  // credential-shape scan below still applies — so naming BREVO_API_KEY is
  // allowed and committing one is still caught. The file creates an empty
  // table; the values are inserted by the deployment, never by the repo.
  'supabase/migrations/0014_mail_settings_fallback.sql',
  // A BACKFILL, AND IT HAS TO BE THE APPLIED TEXT BYTE FOR BYTE. The live
  // database ran this migration months before it was committed, and the copy
  // here is checked against the recorded text by md5 -- so it cannot be
  // reworded to avoid the term. It grants the new table to the server role,
  // which is what every table in this schema does.
  'supabase/migrations/20260908033953_guide_only_lesson_planning.sql',
  // THE SUSPENSION FIXES OF 23 SEPTEMBER 2026. Each creates a check and grants
  // it by name to the roles that must be able to run it. The per-request check
  // in particular MUST be executable by the server role: PostgREST runs it
  // before EVERY request, the server's included, and a missing grant would fail
  // them all. Naming the role is the security property of the line.
  'supabase/migrations/20260923164500_a_suspension_is_immediate.sql',
  'supabase/migrations/20260923173000_a_suspension_reaches_the_socket_too.sql',
  'supabase/migrations/20260923180000_a_door_compares_the_right_things.sql',
  // The once-per-request read sets: revoked from public and anon by name,
  // granted to the roles that evaluate rules, same shape as the three above.
  'supabase/migrations/20260923200000_the_rules_ask_once.sql',
  // Prayer both ways adds one more of those read sets, my_explorers(), granted
  // the same way for the same reason.
  'supabase/migrations/20260924100000_a_guide_can_ask_for_prayer_too.sql',
  // What one person can upload: room_to_upload() is evaluated inside a storage
  // rule, so it is revoked from public and anon by name and granted to the
  // roles that evaluate rules -- the same shape as the read sets above.
  'supabase/migrations/20260925120000_what_one_person_can_upload.sql',
  // The replica fingerprint compares the settings of the four database roles
  // Supabase creates, so it has to name them to select them. It reads the
  // catalogue only; it holds no key and no hostname.
  'supabase/tests/fingerprint.sql',
]);
for (const f of textFiles) {
  if (GUARDRAILS.has(f)) continue;
  read(f)
    .split('\n')
    .forEach((line, i) => {
      for (const [re, what] of FORBIDDEN_TERMS) {
        if (re.test(line)) {
          ok(false, `${f}:${i + 1} mentions ${what}`);
          terms++;
        }
      }
    });
}
if (terms === 0) ok(true, 'nothing names a private deployment, key or pipeline');

// ---------------------------------------------------------------------------
// 4. Workflows, if any, are the fork owner's own business.
// ---------------------------------------------------------------------------
const wfDir = path.join(root, '.github/workflows');
if (fs.existsSync(wfDir)) {
  for (const f of fs.readdirSync(wfDir)) {
    // Full-line YAML comments are stripped first. A workflow that explains why
    // `pull_request_target` is dangerous is doing the right thing, and a check
    // that fails it teaches people to delete the explanation.
    const wf = read(path.join('.github/workflows', f))
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    ok(!/pull_request_target/.test(wf), `${f}: no pull_request_target`);
    ok(
      !/issues:\s*write|contents:\s*write/.test(wf) || /permissions/.test(wf),
      `${f}: any write permission is declared explicitly`,
    );
    // SECRETS: the rule used to be "no workflow may mention secrets at all",
    // which was a proxy for the property actually wanted — that somebody who
    // forks this repository gets a working, green Actions tab without
    // configuring anything.
    //
    // That proxy broke as soon as the project needed OPERATIONAL workflows
    // rather than only CI ones. Keeping a free Supabase project awake, and
    // backing it up, cannot be done without credentials for the database being
    // kept awake; there is no version of those jobs that needs no secrets. The
    // old rule would have forced the choice between having backups and having
    // an honest test, which is how a good invariant turns into a deleted one.
    //
    // So the rule is now the property itself, and it is stricter than the
    // proxy was: a workflow may read secrets, but it must DEGRADE GRACEFULLY
    // when they are absent — check for the empty value and `exit 0`, never
    // `exit 1`. A fork then sees a skipped job with an explanation instead of a
    // red cross for not owning somebody else's database.
    //
    // What this still forbids, via FORBIDDEN_TERMS above: naming the private
    // deployment. A secret NAME is fine; a project ref or URL written into the
    // file is not.
    if (/secrets\./.test(wf)) {
      const guarded = /if \[ -z "\$\{[A-Z_]+:-\}" \]/.test(wf) && /exit 0/.test(wf);
      ok(
        guarded,
        guarded
          ? `${f}: reads secrets, and skips cleanly when a fork has none`
          : `${f}: reads secrets but has no "if unset → exit 0" path — a fork would go red`,
      );
    } else {
      ok(true, `${f}: needs no repository secrets to run`);
    }
  }
}

// ---------------------------------------------------------------------------
// The Orbit is not ours to publish.
//
// It is a separate, private product of the owner's. It was in this repository —
// roughly 1,375 lines across two components, a playlists module and an e2e
// suite, wired into the right rail of every room, with a section on the media
// page branded "Powered by The Orbit". Public, in an open-source project, for
// weeks.
//
// It got there because nobody was looking for it. The open-source boundary pass
// that ran earlier checked for Library OS content, Foundation tooling and
// personal data — the things on the written list — and the Orbit is none of
// those. A checklist answers the question it asks, not the question it stands
// in for, and the real question was never "is Library OS content in here", it
// was "is anything in here not ours to publish".
//
// So the check is by NAME, not by file. Deleting four files is easy to redo by
// accident: a copied component, a pasted rail, a re-imported module. A name is
// what survives all of those.
// ---------------------------------------------------------------------------
{
  const banned = /\bOrbit\b/;
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (['node_modules', '.next', '.next-dev', '.git'].includes(entry.name)) continue;
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.(ts|tsx|js|jsx|mjs|md|json)$/.test(entry.name)) {
        // This file names it in order to ban it.
        if (rel.endsWith('tests/no-backend.js')) continue;
        if (banned.test(fs.readFileSync(path.join(root, rel), 'utf8'))) offenders.push(rel);
      }
    }
  };
  for (const d of ['app', 'components', 'lib', 'tests', 'docs', 'scripts']) {
    if (fs.existsSync(path.join(root, d))) walk(d);
  }
  ok(
    offenders.length === 0,
    offenders.length === 0
      ? 'the Orbit, a private product, is nowhere in this public repository'
      : `the Orbit is a PRIVATE product and appears in: ${offenders.join(', ')}`,
  );
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);

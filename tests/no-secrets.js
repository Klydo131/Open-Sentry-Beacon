// Guardrail: this repository is public, so nothing in it may be a secret.
//
// The live app has its own version of this file because it holds a real church's
// backend. This one exists for the opposite reason: everything here is meant to
// be read by strangers, which makes an accidentally committed key worse, not
// better. A private repo leaks to whoever has access; a public one leaks to a
// crawler within minutes, and the first thing an automated scanner does with a
// found key is use it.
//
//   node tests/no-secrets.js
//
// Plain Node, no dependencies. Exits non-zero on any violation.
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

let bad = 0;
const fail = (m) => {
  bad++;
  console.log(`BAD ${m}`);
};
const ok = (m) => console.log(`OK  ${m}`);

let tracked = [];
try {
  tracked = execSync('git ls-files', { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
} catch {
  console.log('BAD could not list tracked files (is this a git repository?)');
  process.exit(1);
}
ok(`${tracked.length} tracked files to check`);

// ---------------------------------------------------------------------------
// 1. Only .env.example, and its secret slots must be empty.
//
// A filled-in example is the single most common way a key reaches a repository:
// somebody pastes a working value in "just to test", and it is committed as
// documentation.
// ---------------------------------------------------------------------------
const envFiles = tracked.filter((f) => /(^|\/)\.env($|\.)/.test(f));
const notExample = envFiles.filter((f) => !/example/i.test(f));
if (notExample.length) fail(`a real env file is committed: ${notExample.join(', ')}`);
else ok('no env file is committed except the example');

// Every slot whose name says it holds something private, not a list of the
// ones that existed when this was written. Until 2 November 2026 it named seven
// slots of the hosted edition, so selfhost/.env.example could have carried a
// working JWT_SECRET, SERVICE_ROLE_KEY, SMTP_PASS or database password and
// passed.
const SECRET_SLOT = /^\s*([A-Z0-9_]*(KEY|SECRET|TOKEN|PASS|PASSWORD|PASSPHRASE|WEBHOOK_URL|DATABASE_URL|DB_URL|DB_URI)[A-Z0-9_]*|SMTP_USER)\s*=\s*\S+/;
for (const f of envFiles) {
  const filled = read(f)
    .split('\n')
    .filter((l) => SECRET_SLOT.test(l));
  if (filled.length) fail(`${f} has a filled-in secret slot: ${filled.map((l) => l.split('=')[0].trim()).join(', ')}`);
  else ok(`${f} names its settings and fills none of them in`);
}

// ---------------------------------------------------------------------------
// 2. No credential literal anywhere.
//
// Shape-based, so it catches a paste regardless of what the variable was called.
// A Supabase key is a JWT and starts "eyJ"; Resend keys start "re_"; the ingress
// token is 64 hex characters.
//
// WIDENED ON 2 NOVEMBER 2026, after a sweep of every tracked file, the text of
// every committed PDF and every line ever added in the history found no key
// (the owner: "I dont want to see any sensitive information in this project
// like API keys, secret keys or any private information"). These were five
// shapes. They are now every service this project's guides send a person to
// (Supabase, Brevo, Resend, GitHub) and the ones a developer is most likely to
// have on the clipboard from somewhere else.
// ---------------------------------------------------------------------------
const SHAPES = [
  [/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/, 'a JWT (Supabase key)'],
  [/\bre_[A-Za-z0-9]{20,}\b/, 'a Resend API key'],
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, 'a Supabase secret key'],
  // The CLI's access token: not one project but every project on the account.
  [/\bsbp_[a-f0-9]{30,}\b/, 'a Supabase access token'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, 'a GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}/, 'a GitHub fine-grained token'],
  // docs/EMAIL.md sends a church to Brevo for its mail.
  [/\bxkeysib-[a-f0-9]{30,}/, 'a Brevo API key'],
  [/\bxsmtpsib-[a-f0-9]{30,}/, 'a Brevo SMTP key'],
  [/\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/, 'a SendGrid key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'a Google API key'],
  [/\bGOCSPX-[A-Za-z0-9_-]{20,}/, 'a Google OAuth client secret'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  // FEEDBACK_WEBHOOK_URL takes one of these, and the address is the key.
  [/hooks\.slack\.com\/services\/T[A-Za-z0-9]+\/B[A-Za-z0-9]+\/[A-Za-z0-9]+/, 'a Slack webhook address'],
  [/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{20,}/, 'a Discord webhook address'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, 'an Anthropic API key'],
  [/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}/, 'an OpenAI API key'],
  // The giving plan's processors (PayMongo, Stripe) share this shape.
  [/\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/, 'a payment processor secret key'],
  [/\bnpm_[A-Za-z0-9]{36}\b/, 'an npm token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----/, 'a private key'],
  // A database address with its password written in. `${VAR}` and
  // `<placeholder>` are how every guide here writes one, and are not caught.
  // Nor is one on the loopback address: .github/workflows/fresh-install.yml
  // starts a database for one run on the runner itself and throws it away, and
  // nobody reading this can reach a machine's 127.0.0.1 but that machine.
  [/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?):\/\/[^\s:/@'"`]+:(?![$<{])[^\s@/'"`]+@(?!(?:127\.0\.0\.1|localhost)[:/])/,
    'a database address with its password in it'],
];
let literals = 0;
for (const f of tracked) {
  if (/package-lock\.json|\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?)$/.test(f)) continue;
  let body;
  try {
    body = read(f);
  } catch {
    continue;
  }
  body.split('\n').forEach((line, i) => {
    for (const [shape, what] of SHAPES) {
      // The test file naming the shapes is not itself a leak.
      if (f === 'tests/no-secrets.js') continue;
      if (shape.test(line)) {
        fail(`${f}:${i + 1} looks like ${what}`);
        literals++;
      }
    }
  });
}
if (literals === 0) ok('no credential-shaped literal in any tracked file');

// ---------------------------------------------------------------------------
// 3. Nothing secret under a NEXT_PUBLIC_ prefix.
//
// Anything so named is inlined into the JavaScript bundle at build time and
// served to every visitor. The prefix is a promise that the value is public.
// ---------------------------------------------------------------------------
let publicLeaks = 0;
for (const f of tracked.filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f))) {
  read(f)
    .split('\n')
    .forEach((line, i) => {
      if (/NEXT_PUBLIC_[A-Z_]*(SERVICE_ROLE|SECRET|PRIVATE|INGRESS|RESEND)/.test(line)) {
        fail(`${f}:${i + 1} exposes a secret-sounding value to the browser`);
        publicLeaks++;
      }
    });
}
if (publicLeaks === 0) ok('no secret is exposed under a NEXT_PUBLIC_ prefix');

// ---------------------------------------------------------------------------
// 4. The service-role key is never named in code that can reach a browser.
//
// It bypasses Row Level Security completely. In this repository it should not
// appear at all: there is no backend here to use it with.
// ---------------------------------------------------------------------------
const serviceRole = tracked.filter(
  (f) =>
    /^(app|components|lib)\//.test(f) &&
    /\.(ts|tsx|js|jsx|mjs)$/.test(f) &&
    /SERVICE_ROLE|service_role/.test(read(f)),
);
if (serviceRole.length) fail(`service-role key named in shipped code: ${serviceRole.join(', ')}`);
else ok('the service-role key is named nowhere in shipped code');

// ---------------------------------------------------------------------------
// 5. No real person in the sample data.
//
// The seed is fiction and must stay fiction. A real member's name, email or
// phone number reaching a public repository is a privacy incident regardless of
// how harmless the record looks.
// ---------------------------------------------------------------------------
const seed = 'lib/demo/seed.ts';
if (tracked.includes(seed)) {
  const body = read(seed);
  const emails = body.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [];
  // Reserved by RFC 2606 and RFC 6761: .example, .test, .invalid and .localhost
  // can never be registered by anyone, so an address there can never reach a
  // real inbox. A no-reply sender is a system address rather than a person.
  // Anything else is a domain somebody could actually own.
  const RESERVED = /@([\w-]+\.)*(example|test|invalid|localhost)$|@example\.(com|net|org)$/i;
  const SYSTEM = /^(no-?reply|postmaster|donotreply)@/i;
  const foreign = emails.filter((e) => !RESERVED.test(e) && !SYSTEM.test(e));
  if (foreign.length) {
    fail(`${seed} contains addresses outside the reserved example domains: ${[...new Set(foreign)].join(', ')}`);
  } else {
    ok(`sample data uses reserved example domains only (${emails.length} addresses)`);
  }
  const phones = body.match(/\+?\d[\d\s().-]{9,}\d/g) || [];
  if (phones.length) fail(`${seed} contains something phone-shaped: ${phones.slice(0, 3).join(', ')}`);
  else ok('sample data contains no phone numbers');
}

// ---------------------------------------------------------------------------
// 6. No Supabase project is named. Every one is somebody's church.
//
// THIS USED TO ALLOW ONE. The maintainers' own project was named here and in
// docs/DEMO-SETUP.md as "the published demo backend", so a developer could point
// a checkout at a working database. That stopped being true when the same
// project became the first church's live one, with real members in it: the
// docs were inviting strangers to "evaluate against it freely". On 23 September
// 2026 the allow-list was emptied and the docs now say, everywhere, to use your
// own project -- which is also what "a 1 to 1 copy, but not my data" means.
//
// The check stays because the value is in what it refuses. A ref is twenty
// plain lowercase letters, so nothing that hunts key-shaped strings would catch
// one pasted from the wrong terminal, and every project that could be pasted
// holds somebody's congregation.
// ---------------------------------------------------------------------------
const ALLOWED_REFS = new Set();

const REF_HOST = /\b([a-z]{20})\.supabase\.co/g;
const REF_FLAG = /--project-ref[= ]+([a-z]{20})\b/g;
const foreignRefs = [];
for (const file of tracked) {
  if (!/\.(md|ts|tsx|js|mjs|json|ya?ml|sql|env\.example)$/i.test(file)) continue;
  if (file === 'tests/no-secrets.js') continue;
  const body = read(file);
  for (const re of [REF_HOST, REF_FLAG]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(body))) {
      if (!ALLOWED_REFS.has(m[1])) foreignRefs.push(`${file}: ${m[1]}`);
    }
  }
}
if (foreignRefs.length) {
  fail(
    'a real Supabase project is named here:\n    ' +
      [...new Set(foreignRefs)].join('\n    ') +
      '\n    Use a placeholder such as <your-project-ref>. A real ref points a reader at a real church.',
  );
} else {
  ok('no real Supabase project is named anywhere in the repository');
}

// ---------------------------------------------------------------------------
// 7. Nothing of the first church's own.
//
// The owner's instruction for this repository: "a 1 to 1 copy for the open
// source project BUT NOT MY DATA". On 23 September 2026 a sweep of every
// tracked file (and the text of every committed PDF) found the live project's
// ref, the owner's domain and the handle of one real member's e-mail address,
// and removed them. This keeps them out.
//
// FINGERPRINTS, NOT THE VALUES. Listing the identifiers here would publish the
// very things this check exists to keep out, so each is kept as the first 24
// hex digits of its SHA-256. Every e-mail address, every host name, every
// twenty-letter project ref and every handle-shaped word in every tracked text
// file is fingerprinted the same way and compared.
// ---------------------------------------------------------------------------
{
  const crypto = require('crypto');
  const fingerprint = (s) => crypto.createHash('sha256').update(s.toLowerCase()).digest('hex').slice(0, 24);
  const PRIVATE = new Set([
    'e9e533bed926977576578cbd', // the live project's ref
    'cb5355bbf2237e8490fcec8d', // the owner's domain
    'c3cc7088e1acbbf0a6f70e92', // a protected owner address
    '86d8ee3f0dbd686da2472f95', // a protected owner address
    '074db29d1282cfa527925c9a', // a protected owner address
    'f95bb5e3995a8a6eeff6fcaa', // the handle of a real member's address
  ]);
  const shapes = [
    /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi, // e-mail addresses
    /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:online|com|org|net|ph|app|co|io|edu)\b/gi, // host names
    /\b[a-z]{20}\b/g, // project refs
    /\b[a-z]+\d{2,}\b/gi, // handles like name123
  ];
  const found = [];
  for (const file of tracked) {
    if (!/\.(md|ts|tsx|js|mjs|cjs|json|ya?ml|sql|txt|html|css|env\.example)$/i.test(file)) continue;
    if (file === 'tests/no-secrets.js') continue;
    const body = read(file);
    for (const re of shapes) {
      for (const m of body.matchAll(re)) {
        if (PRIVATE.has(fingerprint(m[0]))) found.push(`${file}: fingerprint ${fingerprint(m[0])}`);
      }
    }
  }
  if (found.length) {
    fail('something belonging to the first church is back in the repository:\n    ' +
      [...new Set(found)].join('\n    ') +
      '\n    Replace it with a placeholder. The fingerprint says which one without repeating it.');
  } else {
    ok('nothing of the first church\'s own is in any tracked text file');
  }
}

// ---------------------------------------------------------------------------
// 8. No file that holds a secret by what it is.
//
// Sections 1 and 2 read what a file says. These are refused for what they are,
// whatever is in them: a key file, a tool's saved login, a database dump
// (encrypted or not: backup.yml's encrypted dumps are a workflow's artifacts and
// never belong in the history), and the folders where the Supabase CLI, Vercel
// and the Postgres edition keep a project's own address and data. .gitignore
// keeps most of these out; this keeps out the one somebody adds with -f.
// ---------------------------------------------------------------------------
{
  const BY_NATURE = [
    [/(^|\/)\.envrc$|(^|\/)\.dev\.vars$/, 'an environment file under another name'],
    [/\.(pem|key|p12|pfx|jks|keystore|ppk|kdbx)$/i, 'a key or keystore file'],
    [/(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/, 'a private SSH key'],
    [/(^|\/)\.(pgpass|netrc|git-credentials)$/, 'a saved login'],
    [/(^|\/)(credentials|client_secret[^/]*|service[-_]?account[^/]*)\.json$/i, 'a cloud credentials file'],
    [/\.(sql\.gpg|sql\.gz|dump|pgdump|backup)$/i, 'a database dump'],
    [/(^|\/)supabase\/\.(temp|branches)\/(?!cli-latest$)/, 'the Supabase CLI\'s record of a linked project'],
    [/(^|\/)\.vercel\//, 'Vercel\'s record of a linked project'],
    [/^selfhost\/data\//, 'a running Postgres edition\'s own data'],
  ];
  const byNature = [];
  for (const f of tracked) {
    for (const [re, what] of BY_NATURE) if (re.test(f)) byNature.push(`${f} (${what})`);
  }
  // An .npmrc is ordinary configuration until it carries a login.
  for (const f of tracked.filter((f) => /(^|\/)\.(npmrc|yarnrc\.yml)$/.test(f))) {
    if (/_auth(Token)?\s*[=:]\s*\S/.test(read(f))) byNature.push(`${f} (a package registry login)`);
  }
  if (byNature.length) fail('a file that holds secrets by its nature is committed:\n    ' + byNature.join('\n    '));
  else ok('no key file, saved login, database dump or linked-project folder is committed');
}

// ---------------------------------------------------------------------------
// 9. No real person's e-mail address or phone number, anywhere.
//
// Section 5 holds the sample data to this. Everything else was held only to
// section 7's short list of addresses already known to be private, so a new one
// pasted into a guide, a test or a comment (a member's, from a bug report; the
// owner's own) would have passed. Now every address in every tracked text file
// must be at a domain nobody can own, be a system sender, or be one of the few
// below, each with the reason it is safe. Each exception must still be in use,
// so the list cannot quietly grow into a place to hide things.
// ---------------------------------------------------------------------------
{
  const BINARY = /\.(jpe?g|png|gif|ico|webp|pdf|gz|zip|wasm|woff2?|ttf|otf|mp3|wav|ogg|m4a|mp4|webm)$/i;
  const texts = tracked.filter((f) => !BINARY.test(f) && f !== 'tests/no-secrets.js' && !/package-lock\.json$/.test(f));
  const RESERVED = /@([\w-]+\.)*(example|test|invalid|localhost)$|@example\.(com|net|org)$/i;
  const SYSTEM = /^(no-?reply|postmaster|donotreply)@/i;
  const ADDRESS_EXCEPTIONS = new Map([
    // How a guide shows the reader where their own address goes.
    ['you@yourchurch.org', 'a placeholder in the first-leader command'],
    ['you@your-church.org', 'a placeholder in the first-leader command'],
    ['admin@yourchurch.org', 'a placeholder in a guide'],
    ['invites@yourchurch.org', 'a placeholder in a guide'],
    ['hello@your-domain.org', 'a placeholder in a guide'],
    // The demo runbook's tip about Gmail's plus addresses needs Gmail's domain.
    ['you@gmail.com', 'a placeholder for "your own Gmail address"'],
    ['yourname+guide@gmail.com', 'a placeholder showing a Gmail plus address'],
    ['yourname+explorer@gmail.com', 'a placeholder showing a Gmail plus address'],
    // Addresses a service defines, shown so a reader recognises them.
    ['onboarding@resend.dev', 'Resend\'s own shared test sender'],
    ['something@smtp-brevo.com', 'the shape of a Brevo SMTP login'],
    // A licence asks for its copyright notice to be kept, address and all.
    ['jonasschievink@gmail.com', 'a crate author\'s notice in THIRD-PARTY-LICENCES.txt'],
    // A disguised link a test and an applied migration must refuse.
    ['faithlife.com@example.tld', 'a deceptive link a migration refuses'],
  ]);
  const ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g;
  // A Philippine mobile number, or anything written with the country code.
  const PHONE = /(?:\+63[\s-]?|\b0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b|\+63[\s-]?\d{1,2}[\s-]?\d{3,4}[\s-]?\d{4}\b/g;
  // The tests' own numbers, in the shapes everybody uses for a made-up one.
  const PHONE_EXCEPTIONS = new Set(['09171234567', '09175551234', '09175550142']);
  const digits = (s) => s.replace(/\D/g, '').replace(/^63/, '0');

  const foreign = [];
  const phones = [];
  const usedAddresses = new Set();
  const usedPhones = new Set();
  for (const f of texts) {
    let body;
    try {
      body = read(f);
    } catch {
      continue;
    }
    // Only lines with an @ in them: run over whole files, this one pattern
    // took longer than every other check here put together.
    for (const line of body.includes('@') ? body.split('\n') : []) {
      if (!line.includes('@')) continue;
      for (const m of line.matchAll(ADDRESS)) {
        const a = m[0].toLowerCase();
        if (RESERVED.test(a) || SYSTEM.test(a)) continue;
        if (ADDRESS_EXCEPTIONS.has(a)) {
          usedAddresses.add(a);
          continue;
        }
        foreign.push(`${f}: ${a}`);
      }
    }
    for (const m of body.matchAll(PHONE)) {
      const n = digits(m[0]);
      if (PHONE_EXCEPTIONS.has(n)) {
        usedPhones.add(n);
        continue;
      }
      phones.push(`${f}: ${m[0].trim()}`);
    }
  }
  if (foreign.length) {
    fail('an e-mail address at a domain somebody can own:\n    ' + [...new Set(foreign)].join('\n    ') +
      '\n    Use a reserved domain (name@example.org, name@church.example). If it truly must stay, add it' +
      '\n    to ADDRESS_EXCEPTIONS with the reason, where a reviewer will see it.');
  } else {
    ok(`every e-mail address is at a reserved domain, a system sender or a named exception (${texts.length} text files)`);
  }
  const unusedAddresses = [...ADDRESS_EXCEPTIONS.keys()].filter((a) => !usedAddresses.has(a));
  if (unusedAddresses.length) fail(`ADDRESS_EXCEPTIONS lists addresses no file uses any more; remove them: ${unusedAddresses.join(', ')}`);
  else ok(`each of the ${ADDRESS_EXCEPTIONS.size} address exceptions is still in use`);
  if (phones.length) {
    fail('a phone number:\n    ' + [...new Set(phones)].join('\n    ') +
      '\n    A test that needs one uses 0917 123 4567; nothing else needs one.');
  } else {
    ok('no phone number beyond the tests\' made-up ones');
  }
  const unusedPhones = [...PHONE_EXCEPTIONS].filter((n) => !usedPhones.has(n));
  if (unusedPhones.length) fail(`PHONE_EXCEPTIONS lists numbers no file uses any more; remove them: ${unusedPhones.join(', ')}`);
}

// ---------------------------------------------------------------------------
// 10. No photo says where it was taken.
//
// A phone writes the place into every photo it takes, to a few metres. A
// screenshot carries none, but a photo of a church hall, a guide's picture
// from a member, or a "before" image for a bug report does: a home address,
// published. lib/live/photo-location.ts strips it from what members upload; this is
// the same rule for what is committed. tests/fixtures/located-upright.jpg is
// the one photo kept with a place in it (an invented one, in the sea off West
// Africa), because the server's check is tested against it, and the check below
// must see that place or it is not looking.
// ---------------------------------------------------------------------------
{
  const FIXTURE = 'tests/fixtures/located-upright.jpg';
  const PLACED = new Set([FIXTURE]);
  // The GPS pointer of an EXIF block (tag 0x8825, type LONG), in either byte order.
  const GPS_MM = Buffer.from([0x88, 0x25, 0x00, 0x04]);
  const GPS_II = Buffer.from([0x25, 0x88, 0x04, 0x00]);
  const saysWhere = (buf) => {
    let at = buf.indexOf('Exif\0\0');
    while (at !== -1) {
      const block = buf.subarray(at, at + 65536);
      if (block.includes(GPS_MM) || block.includes(GPS_II)) return true;
      at = buf.indexOf('Exif\0\0', at + 6);
    }
    return false;
  };
  const placed = [];
  let seenFixture = false;
  for (const f of tracked.filter((f) => /\.(jpe?g|tiff?|heic|heif|webp|png)$/i.test(f))) {
    let buf;
    try {
      buf = fs.readFileSync(path.join(root, f));
    } catch {
      continue;
    }
    if (!saysWhere(buf)) continue;
    if (f === FIXTURE) seenFixture = true;
    if (!PLACED.has(f)) placed.push(f);
  }
  if (placed.length) {
    fail('a photo says where it was taken:\n    ' + placed.join('\n    ') +
      '\n    Strip it first, e.g. exiftool -gps:all= <file>, or save it again from a screenshot.');
  } else {
    ok('no committed photo says where it was taken');
  }
  if (!seenFixture) fail(`the check did not find the place in ${FIXTURE}, so it is not looking`);
  else ok('and it finds the invented place in the one photo kept with one, so it is looking');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);

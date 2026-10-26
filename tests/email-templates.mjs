// The two rules that made an invitation arrive as a blank message.
//
// These templates are pasted into the Supabase dashboard rather than deployed,
// so nothing else in this repository ever executes them. That is exactly why
// they need a check: a mistake here is invisible until somebody reports an
// empty email, and the person who reports it is a stranger being invited to a
// church.
//
// RULE 1 — A SHORT LIST OF VARIABLES, AND NEVER {{ .ConfirmationURL }}.
//
// Two separate failures produced this rule, and they pull in opposite
// directions, so both halves are checked.
//
// A template that also used {{ .Email }} was delivered with nothing in the body
// at all. Go renders these, and a field it cannot resolve aborts the render
// rather than leaving a gap, so a blank message is the failure mode and no
// dashboard anywhere reports it. Hence: a short allow-list.
//
// And {{ .ConfirmationURL }} points at Supabase's own /auth/v1/verify, which
// SPENDS THE TOKEN on any GET, before redirecting. A mail scanner, a corporate
// filter or a phone previewing the message burns the link, and the invited
// person is told it expired on their first open. Every time, for months, with
// nothing they did wrong. So the templates build the link themselves out of
// {{ .TokenHash }} and hand it to /join, which redeems it in the browser where
// no scanner follows.
//
// RULE 2 — NO HTML COMMENTS.
//
// Documentation lived at the top of both files and was pasted along with them.
// A comment in a pasted template is body content a client may or may not strip,
// and a {{ ... }} written inside one is still substituted, because Go templating
// has never heard of an HTML comment.

import { readFileSync, existsSync, readdirSync } from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const DIR = 'docs/email-templates';

if (!existsSync(DIR)) {
  console.log('SKIP  no email templates in this checkout');
  process.exit(0);
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.html'));
ok(files.length > 0, 'there are templates to check');

// TWO DIALECTS LIVE IN THIS FOLDER, AND MIXING THEM IS SILENT.
//
// Supabase Auth renders with Go templating and substitutes `.ConfirmationURL`.
// Brevo renders with its own engine and substitutes `params.JOIN_URL`, plus
// `{% if %}` blocks Go has never heard of.
//
// Paste one into the other's box and nothing announces the mistake: Supabase
// aborts the render and delivers an empty body, and Brevo leaves the unknown
// tag sitting in the message as literal text. Both look like a working save.
//
// So the filename decides which rules apply. `brevo-*` is Brevo's; everything
// else is Supabase's.
for (const file of files) {
  const html = readFileSync(`${DIR}/${file}`, 'utf8');
  const isBrevo = file.startsWith('brevo-');

  const vars = [...html.matchAll(/\{\{([^}]*)\}\}/g)].map((m) => m[1].trim());
  ok(vars.length > 0, `${file}: substitutes something, so the link can appear`);
  ok(!/<!--/.test(html), `${file}: contains no HTML comment to be pasted into an inbox`);

  if (isBrevo) {
    const allowed = new Set([
      'params.JOIN_URL', 'params.FULL_NAME', 'params.CHURCH_NAME', 'params.ROLE',
    ]);
    const strays = [...new Set(vars.filter((v) => !allowed.has(v)))];
    ok(strays.length === 0,
       `${file}: uses only params the invite function sends${strays.length ? ` (found ${strays.join(', ')})` : ''}`);
    ok(vars.includes('params.JOIN_URL'), `${file}: carries the one-time link`);
    ok(!/\.ConfirmationURL/.test(html),
       `${file}: carries no Supabase tag, which Brevo would print as literal text`);
    // NO CONDITIONAL BLOCKS, IN EITHER DIALECT.
    //
    // A first version used `{% if params.FULL_NAME %}` to fall back to a
    // generic greeting when a name was missing. Brevo's preview showed the tags
    // as literal text -- which is expected there, since params are only filled
    // at send time -- and that left no way to confirm from outside whether the
    // engine evaluates them at send time or ships them to the reader verbatim.
    //
    // An unverifiable maybe is not acceptable in a message going to a
    // congregation. Plain `{{ params.X }}` substitution is the part that is
    // certain, so the design is built to read correctly with any value,
    // including an empty one, and needs no branching at all.
    ok(!/\{%/.test(html),
       `${file}: uses no conditional block, whose send-time behaviour cannot be verified from here`);
    const hrefs = (html.match(/href="\{\{\s*params\.JOIN_URL\s*\}\}"/g) || []).length;
    ok(hrefs >= 2, `${file}: the link appears as both a button and copyable text`);
  } else {
    const allowed = new Set(['.SiteURL', '.TokenHash']);
    const strays = [...new Set(vars.filter((v) => !allowed.has(v)))];
    ok(strays.length === 0,
       `${file}: uses no variable beyond .SiteURL and .TokenHash${strays.length ? ` (found ${strays.join(', ')})` : ''}`);
    // THE RULE THIS FILE EXISTS FOR NOW. A prefetched link is spent before the
    // reader touches it, and the reader is told they were too slow.
    ok(!/\.ConfirmationURL/.test(html),
       `${file}: never uses .ConfirmationURL, which any mail scanner can spend`);
    ok(vars.includes('.TokenHash'), `${file}: carries the token the browser redeems`);
    ok(!/\{%/.test(html),
       `${file}: carries no Brevo block, which Go templating cannot render at all`);
    // Bare ampersand. `&amp;` renames `type` to `amp;type` in some clients,
    // which turns a password reset into a failed invitation without a word.
    ok(!/token_hash=\{\{\s*\.TokenHash\s*\}\}&amp;/.test(html),
       `${file}: joins its parameters with a bare & so the type survives the inbox`);
    const kind = /recovery/.test(file) ? 'recovery' : 'invite';
    // A password link opens its own page since 26 October 2026; an invitation
    // still opens /join.
    const page = kind === 'recovery' ? 'new-password' : 'join';
    const built = new RegExp(
      String.raw`href="\{\{ \.SiteURL \}\}/` + page + String.raw`\?token_hash=\{\{ \.TokenHash \}\}&type=` + kind + '"', 'g');
    const hrefs = (html.match(built) || []).length;
    ok(hrefs >= 2, `${file}: the link opens /${page}, as both a button and copyable text, and says type=${kind}`);
  }
}

// ---- The page the link lands on -------------------------------------------
//
// A template and the screen that receives its link are one contract, and half
// of it lives in another file. The template writes `&type=`; some clients
// re-encode that ampersand and deliver `amp;type` instead. A reset link that
// reaches `/join` (an older e-mail, or a project still on the old template)
// is handed to `/new-password`, so the reading of both spellings decides
// whether a password reset silently arrives as an invitation.
const door = readFileSync('components/live/DoorPages.tsx', 'utf8');
const reset = readFileSync('lib/live/password.ts', 'utf8');
ok(/search\.get\('type'\)\s*\?\?\s*search\.get\('amp;type'\)/.test(reset)
   && /if \(isResetLink\(params, window\.location\.hash\)\) \{\s*router\.replace\(`\$\{NEW_PASSWORD_PATH\}/.test(door),
   'type is read in both spellings, and /join hands a reset link to /new-password before redeeming anything');
ok(/verifyOtp\(\{ token_hash: tokenHash, type: kind \}\)/.test(door)
   && /verifyOtp\(\{ token_hash: tokenHash, type: 'recovery' \}\)/.test(reset),
   'and each page redeems its token in the browser, where no mail scanner follows');

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);

// The pocket keeps tools, not feeds, and says so before anybody tries.
//
// ---------------------------------------------------------------------------
// ASKED FOR: "I want to limit (with a disclosure of course to every user) to
// take our social media apps in the pocket application (Except for Youtube).
// Facebook, X, Instagram, Tiktok, LinkedIn, etc. are not allowed in the pocket
// application because it can bring distractions to all users."
//
// A PRODUCT RULE, NOT A SAFETY ONE, and that shapes how it is built. tidyUrl
// refuses what could HARM somebody -- a `javascript:` address that would run in
// this app's origin. This refuses what is perfectly safe and that the church has
// decided does not belong one tap from a study. So it fails with words a person
// can read, and the reason is on screen BEFORE anybody tries rather than only
// after they are turned away.
//
// AND IT IS IN THE DATABASE AS WELL AS THE BROWSER. Until this week the pocket
// lived in localStorage, where a client-side rule would have been the whole of
// it. It is rows now, and a row can be written by anything holding a session, so
// a rule living only on the screen holds only until somebody uses something
// other than the screen.
//
//   node tests/the-pocket-is-for-tools.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// The same shape the other migration checks use: comments blanked, length
// preserved, so a reported position still points at the real line. Blanking a
// `--` that sits inside a string literal would over-strip, which can only ever
// produce a false FAIL -- never a false pass.
const stripSql = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

const lib = read('lib/pocket.ts');
const ui = read('components/Pocket.tsx')
  .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

// ---------------------------------------------------------------------------
// 1. WHAT IT REFUSES AND WHAT IT KEEPS  (executed, not pattern-matched)
// ---------------------------------------------------------------------------
{
  // The real functions, lifted out and run. An assertion that the source
  // mentions "facebook" would pass on a list that never gets consulted.
  const pick = (name) => {
    const at = lib.indexOf(`export const ${name}`);
    const end = lib.indexOf(';\n', lib.indexOf('=', at));
    return lib.slice(at, end + 1).replace('export const', 'const');
  };
  const fnAt = lib.indexOf('export function pocketRefusal');
  const fn = lib.slice(fnAt, lib.indexOf('\n}', fnAt) + 2)
    .replace('export function', 'function')
    .replace('(url: string): string | null', '(url)');
  const hostAt = lib.indexOf('export function hostOf');
  const hostFn = lib.slice(hostAt, lib.indexOf('\n}', hostAt) + 2)
    .replace('export function', 'function')
    .replace('(url: string): string', '(url)');

  // eslint-disable-next-line no-new-func
  const pocketRefusal = new Function(
    `${pick('NOT_IN_THE_POCKET').replace(/:\s*\{[^}]*\}\[\]/, '')}
     ${pick('ALWAYS_WELCOME')}
     ${hostFn}
     ${fn}
     return pocketRefusal;`)();

  const feeds = [
    'https://www.facebook.com/p', 'https://m.facebook.com/p', 'https://fb.watch/a',
    'https://x.com/a', 'https://twitter.com/a', 'https://www.instagram.com/p/1',
    'https://www.tiktok.com/@a', 'https://www.linkedin.com/feed',
    'https://www.threads.net/@a', 'https://www.reddit.com/r/x',
    'https://www.snapchat.com/', 'https://www.pinterest.ph/pin/1',
    'https://bsky.app/profile/a',
  ];
  const through = feeds.filter((u) => pocketRefusal(u) === null);
  ok(through.length === 0,
     `every named social feed is refused (${feeds.length - through.length}/${feeds.length})`
     + (through.length ? ` — LET THROUGH: ${through.join(', ')}` : ''));

  // THE EXCEPTION, NAMED BECAUSE IT WAS NAMED. The church links studies and
  // hymns to YouTube, and video is deliberately kept out of this app's own
  // uploads, so YouTube is where that material already lives.
  const welcome = [
    'https://www.youtube.com/watch?v=a', 'https://youtu.be/a',
    'https://open.spotify.com/track/1', 'https://www.office.com/',
    'https://drive.google.com/', 'https://faithlife.com/',
    // A blocked name in the PATH is not a blocked site.
    'https://example.com/why-i-left-facebook.html',
  ];
  const refused = welcome.filter((u) => pocketRefusal(u) !== null);
  ok(refused.length === 0,
     `and every tool still goes in, YouTube included (${welcome.length - refused.length}/${welcome.length})`
     + (refused.length ? ` — WRONGLY REFUSED: ${refused.join(', ')}` : ''));

  ok(/YouTube is the exception/.test(pocketRefusal('https://x.com/a') ?? ''),
     'and a refusal explains itself rather than failing silently');
}

// ---------------------------------------------------------------------------
// 2. THE DISCLOSURE IS SAID TO EVERYBODY, NOT ONLY TO SOMEBODY TURNED AWAY
// ---------------------------------------------------------------------------
//
// "with a disclosure of course to every user" was the request. A rule somebody
// only meets as a refusal is a rule they experience as the app being broken.
{
  ok(/Social feeds are not kept here/.test(ui),
     'the pocket states the rule on screen');
  // Not inside the error branch: it has to be there before anybody tries.
  ok(!/error &&[\s\S]{0,200}Social feeds are not kept here/.test(ui),
     'and states it whether or not anybody has just been refused');
  ok(/pocketRefusal/.test(ui),
     'and the screen actually consults the rule before saving');
}

// ---------------------------------------------------------------------------
// 3. AND THE DATABASE REFUSES REGARDLESS OF THE SCREEN
// ---------------------------------------------------------------------------
{
  const dir = path.join(root, 'supabase/migrations');
  const file = fs.readdirSync(dir).find((f) => f.includes('the_pocket_is_for_tools'));
  ok(!!file, 'the migration is present');
  const sql = file ? read(`supabase/migrations/${file}`) : '';

  // READ THE CODE, NOT THE PROSE. The first version of the ordering check below
  // compared sql.indexOf('youtube') against sql.indexOf('facebook') across the
  // whole file, and failed -- correctly, on its own terms, and for a reason that
  // had nothing to do with the rule. The migration's header quotes the request,
  // which names Facebook, and a comment in its body names the very example this
  // file also uses, example.com/why-i-left-facebook. So "facebook" appeared 131
  // characters before any SQL did, and what the assertion actually measured was
  // the order of two sentences. Every check here now runs against the stripped
  // source, which also means a comment DESCRIBING a trigger can no longer stand
  // in for one.
  const code = stripSql(sql);

  ok(/create trigger pocket_apps_are_tools[\s\S]{0,120}before insert or update/.test(code),
     'a trigger checks every insert AND every update');

  const allowAt = code.search(/youtube\\\.com/);
  const blockAt = code.search(/facebook\\\.com/);
  ok(allowAt !== -1 && blockAt !== -1 && allowAt < blockAt,
     'YouTube is allowed first, so a study link is never caught by a feed rule');
  // AND FIRST HAS TO MEAN FINAL. Matching YouTube earlier in the function buys
  // nothing if the branch falls through into the feed rule underneath it.
  ok(/youtube\\\.com[^\n]*\bthen\b\s*return new;/.test(code),
     'and that branch returns, rather than falling through to the feed rule');

  ok(/regexp_replace\(new\.url/.test(code),
     'the host is parsed out, so a blocked name in a path is not a blocked site');
  ok(/raise exception 'That one is not kept in the pocket/.test(code),
     'and it refuses with words a person can read');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);

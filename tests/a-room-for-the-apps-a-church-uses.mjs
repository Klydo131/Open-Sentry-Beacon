// The apps a church already uses, and a Director pairing the waiting list.
//
// ---------------------------------------------------------------------------
// TWO THINGS ASKED FOR IN ONE EVENING, and they share a file because they share
// a rule: the app must not guess on behalf of a church.
//
// 1. AN "APPS" ROOM. The Bible a congregation reads, the hymnal they sing from.
//    "When they tap or click it, it automatically goes to the app destination."
//
//    THE ADDRESSES ARE THE CHURCH'S, NOT OURS, and that is not laziness. The
//    build environment's network refuses those domains, so any list shipped
//    hard-coded would have been addresses written from memory and handed to a
//    congregation untested. A dead link is a dead end at the moment somebody
//    reached for scripture. Leadership pastes what it actually uses.
//
//    AND THE "OPENS THE APP" PART NEEDS NOTHING CLEVER. A plain https link to
//    an app's own domain is opened by the installed app on iOS and Android --
//    Universal Links and App Links -- and by the browser otherwise. A custom
//    scheme like `hymnal://` works for people who already have it and shows
//    everybody else an error page, which is the wrong way round.
//
// 2. AUTO-PAIRING. "If there are too many candidates and the ED or Director
//    have to input alot of Guides and Explorers... there must be a button for
//    auto pair."
//
//    IT PROPOSES; IT DOES NOT PAIR. A pairing is two named people being told
//    they will walk together for months. Forty created by one tap, with no list
//    shown first, is not something a Director can supervise.
//
//    AND MINORS ARE EXCLUDED ON PURPOSE. An Explorer under eighteen assigned to
//    an adult by an algorithm, with nobody having thought about which adult, is
//    the one pairing in this app that must never happen without a person
//    deciding.
//
//   node tests/a-room-for-the-apps-a-church-uses.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ')
  .replace(/\s+/g, ' ');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const appsSrc  = read('app/apps/page.tsx');
const apps     = strip(appsSrc);
const shell    = strip(read('components/LiveAppShell.tsx'));
const data     = strip(read('lib/live/data.ts'));
const adminSrc = read('components/live/AdminPage.tsx');
const admin    = strip(adminSrc);

const find = (needle) => fs.readdirSync(path.join(root, 'supabase/migrations')).find((f) => f.includes(needle));
const appsSql = (() => { const f = find('a_room_for_the_apps'); return f ? read(`supabase/migrations/${f}`) : ''; })();
const pairSql = (() => { const f = find('a_director_can_pair_the_waiting_list'); return f ? read(`supabase/migrations/${f}`) : ''; })();

// ---------------------------------------------------------------------------
// 1. THE ROOM EXISTS AND EVERYBODY CAN OPEN IT
// ---------------------------------------------------------------------------
{
  ok(fs.existsSync(path.join(root, 'app/apps/page.tsx')), 'there is an Apps room');
  ok(/href: '\/apps'/.test(shell), 'and it is in the navigation');

  // EXPLORERS TOO. A hymnal is not leadership's tool, and this is the one room
  // where the whole congregation is the audience.
  ok(!/role !== 'ds'[\s\S]{0,80}\/apps/.test(shell),
     'and it is not fenced away from Explorers, who are who it is for');

  ok(/church_apps_read[\s\S]{0,200}is_approved_user\(\)/.test(appsSql),
     'any approved member of the church may read it');
  ok(/church_apps_write[\s\S]{0,200}manages_church/.test(appsSql),
     'and only leadership adds to it');
}

// ---------------------------------------------------------------------------
// 2. THE LINKS ARE ORDINARY https, AND CHECKED TWICE
// ---------------------------------------------------------------------------
{
  ok(/url\s+text not null check \(url ~\* '\^https:\/\/'\)/.test(appsSql),
     'the column refuses anything that is not https');
  ok(/\^https:/.test(data) && /addChurchApp/.test(data),
     'and the form says so while it is still open, rather than by constraint violation');

  // A SECOND GUARD AT THE POINT OF RENDER. The database refuses non-https; this
  // refuses anything that does not PARSE, so a row written before a constraint
  // or by some future path still cannot put a bad href in front of somebody.
  ok(/safeExternalUrl\(app\.url\)/.test(apps),
     'and every link is parsed again before it is drawn');
  ok(/if \(!href\) return null;/.test(apps),
     'with a row that fails simply not drawn');

  ok(/target="_blank"/.test(apps) && /rel="noopener noreferrer"/.test(apps),
     'links open away from the app without handing it the opener');

  // NO CUSTOM SCHEMES ANYWHERE. The failure mode is invisible to whoever adds
  // it, because it works on their phone.
  ok(!/[a-z]+:\/\/(?!\/)/.test(apps.replace(/https:\/\//g, '')),
     'and nothing reaches for a custom scheme that would fail for most people');
}

// ---------------------------------------------------------------------------
// 3. NOTHING WAS INVENTED
// ---------------------------------------------------------------------------
//
// THE CHECK THIS FILE EXISTS FOR MOST. Seeding a church's room with addresses
// typed from memory, in an environment that could not open them, is the exact
// shape of mistake this project keeps finding -- a thing that looks finished and
// is wrong where nobody local can see it.
{
  ok(!/insert into public\.church_apps/i.test(appsSql),
     'the migration seeds no addresses it could not verify');
  // THIS CHECK WAS BROKEN TWICE, AND THE SECOND WAY IS THE INTERESTING ONE.
  //
  // First it searched the raw migration for domain fragments -- and the
  // migration's own prose says "a custom scheme like `hymnal://`", so it
  // matched the sentence explaining the rule and reported the rule as broken.
  //
  // Then it searched the COMMENT-STRIPPED source instead, which could never
  // work: `strip()` removes everything after `//`, and every URL contains one.
  // So `https://egwwritings.org` pasted into live code was swallowed by the
  // stripper before the check saw it, and a deliberately baked-in address came
  // back green. A check that cannot see the thing it forbids is worse than
  // absent, because it is believed.
  //
  // So: the RAW source, and only https URLs inside a quoted string, which is
  // what "baked in" actually means. Prose is not a string literal.
  const quoted = (src) =>
    [...src.matchAll(/['"`](https:\/\/[^'"`\s]+)['"`]/g)].map((m) => m[1]);
  const literals = [...quoted(appsSrc), ...quoted(appsSql)]
    // The form's own placeholder is a prompt, not an address.
    .filter((u) => !/^https:\/\/[.\u2026]*$/.test(u));
  ok(literals.length === 0,
     `no real address is baked in${literals.length ? ` (found: ${literals.join(', ')})` : ''}`);
}

// ---------------------------------------------------------------------------
// 4. AUTO-PAIRING PROPOSES, AND NEVER PAIRS BY ITSELF
// ---------------------------------------------------------------------------
{
  ok(/create or replace function public\.suggest_pairings/.test(pairSql),
     'there is a function that proposes pairings');

  // STABLE is the machine-checkable half of "writes nothing": Postgres refuses
  // to let a STABLE function modify the database.
  ok(/\bstable\b/i.test(pairSql),
     'declared STABLE, so the database itself refuses to let it write');
  ok(!/insert into pairings|update pairings/i.test(pairSql),
     'and it contains no write to pairings at all');

  ok(/manages_church\(v_church\)/.test(pairSql),
     'only leadership of that church may ask');

  ok(/live\.createPairing\(row\.dm_id, row\.ds_id/.test(admin),
     'the pairings are made through the ordinary path, one at a time');
  ok(/failed\.push\(/.test(admin),
     'so a refusal names who and why instead of taking the batch down');
}

// ---------------------------------------------------------------------------
// 5. THE CAP, THE FAIRNESS, AND THE CHILD
// ---------------------------------------------------------------------------
{
  ok(/guide_pairing_limit_for\(v_church\)/.test(pairSql),
     'it reads the church’s own cap rather than assuming five');
  ok(/< v_cap/.test(pairSql),
     'and never proposes a Guide who is already at it');

  // A RUNNING TALLY, NOT A FRESH COUNT. Re-reading per Explorer would propose
  // the same Guide repeatedly and blow past the cap on confirmation.
  ok(/loads := jsonb_set/.test(pairSql),
     'the load is counted as it goes, so one Guide cannot be proposed twice over');
  ok(/order by \(value::text\)::integer asc/.test(pairSql),
     'and the least-burdened Guide is chosen, so one person does not fill up first');

  ok(/not public\.is_minor\(p\.birthday\)/.test(pairSql),
     'a minor is never auto-assigned to an adult');
  ok(/under eighteen|minor/i.test(adminSrc),
     'and the screen says so, rather than dropping them silently');

  ok(/order by p\.created_at asc/.test(pairSql),
     'whoever has waited longest is placed first');
}

// ---------------------------------------------------------------------------
// 6. AN EMPTY PROPOSAL IS EXPLAINED
// ---------------------------------------------------------------------------
//
// "Nobody is waiting" and "every Guide is full" look identical to a Director
// and mean opposite things: the second one means the church needs another
// Guide, not another pairing.
{
  ok(/Nobody is waiting/.test(adminSrc), 'an empty result says so plainly');
  ok(/at the limit for/.test(adminSrc),
     'and names the other reason it can be empty, which needs a different answer');
  ok(/proposal === null/.test(admin),
     'and not-yet-asked is a different state from asked-and-empty');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);

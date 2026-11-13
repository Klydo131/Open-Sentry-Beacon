// The example studies name their sources, and the Explorer's series is plain.
//
// WHAT WAS ASKED FOR, across two messages:
//
//   
//
//   
//
// WHAT WAS WRONG. The four example series read pleasantly and cited NOTHING.
// Each lesson was about 360 characters with a Bible reference and no indication
// of where the thinking came from -- which is precisely what machine-written
// filler looks like from the outside, and left a Guide with no answer to "says
// who?".
//
//   node tests/the-studies-are-sourced.mjs
//
// Reads the migration. Needs no database.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'supabase/migrations');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

const file = fs.readdirSync(dir)
  .filter((f) => f.includes('the_example_studies_have_sources')).sort().pop();
ok(!!file, `the migration is present (${file ?? 'MISSING'})`);

// THE COMMENT BLOCK LISTS THE BANNED WORDS IN ORDER TO BAN THEM, so a check
// that cannot tell an explanation from the thing it explains fails on its own
// documentation. Strip SQL comments before reading anything.
const raw = file ? fs.readFileSync(path.join(dir, file), 'utf8') : '';
const sql = raw.replace(/^\s*--[^\n]*$/gm, '');

// Pull each lesson body out of the migration, tagged with the series it belongs
// to, so the Explorer's series can be held to a stricter rule than the rest.
const lessons = [];
for (const m of sql.matchAll(
  /update public\.lessons set\s*\n\s*title = '((?:[^']|'')*)',\s*\n\s*body = '((?:[^']|'')*)'\s*\n\s*where series_id = '([0-9a-f-]+)' and position = (\d+);/g
)) {
  lessons.push({
    title: m[1].replace(/''/g, "'"),
    body: m[2].replace(/''/g, "'"),
    series: m[3],
    position: Number(m[4]),
  });
}
ok(lessons.length === 15, `all fifteen lessons are rewritten (${lessons.length})`);

const EXPLORER = '11110000-0000-4000-8000-00000000000a';

// ---------------------------------------------------------------------------
// 1. EVERY LESSON SAYS WHERE IT CAME FROM
// ---------------------------------------------------------------------------
{
  const unsourced = lessons.filter((l) => !l.body.includes('**Where this comes from:**'));
  ok(unsourced.length === 0,
     unsourced.length
       ? `these name no source: ${unsourced.map((l) => l.title).join('; ')}`
       : 'every lesson names where its thinking came from');

  const unread = lessons.filter((l) => !l.body.includes('**Read:**'));
  ok(unread.length === 0, 'and every lesson sends the reader to a passage, by book and verse');
}

// ---------------------------------------------------------------------------
// 2. THE SOURCES ARE THE CHURCH'S OWN
// ---------------------------------------------------------------------------
//
// "Not some random published no basis points." Every citation has to resolve to
// something the Seventh-day Adventist Church itself publishes: the Ellen G.
// White Estate, the General Conference's statement of beliefs, or Voice of
// Prophecy. These addresses were checked before being written down.
{
  const ADVENTIST = [
    'm.egwwritings.org',        // Ellen G. White Estate, full text, free
    'whiteestate.org',          // the Estate itself
    'adventist.org/beliefs',    // the 28 Fundamental Beliefs
    'voiceofprophecy.com',      // Discover Bible Guides, written for seekers
  ];
  const missing = lessons.filter((l) => {
    const cite = l.body.slice(l.body.indexOf('**Where this comes from:**'));
    return !ADVENTIST.some((d) => cite.includes(d));
  });
  ok(missing.length === 0,
     missing.length
       ? `these cite nothing Adventist: ${missing.map((l) => l.title).join('; ')}`
       : 'every source is one the Adventist church itself publishes');

  // A citation with no work named is an appeal to authority, not a source.
  const named = lessons.filter((l) => /Steps to Christ|Desire of Ages|Ministry of Healing|Fundamental Beliefs|Discover Bible Guides/.test(l.body));
  ok(named.length === lessons.length, 'and each names the actual book or document, not just a website');

  // The belief numbers are asserted in the text, so they have to be the real
  // ones. Checked against the General Conference's published list.
  const BELIEFS = {
    10: 'The Experience of Salvation',
    20: 'The Sabbath',
    22: 'Christian Behavior',
    25: 'The Second Coming of Christ',
    28: 'The New Earth',
  };
  // BOTH DIRECTIONS. Checking only "does number 20 have the right name" passes
  // a citation that says number 21 is "The Sabbath" -- the number is simply
  // absent from the table and the check shrugs. A wrong NUMBER beside a right
  // name is the likelier slip of the two, and it was the one this missed.
  const byName = Object.fromEntries(Object.entries(BELIEFS).map(([n, t]) => [t, Number(n)]));
  const wrong = [];
  for (const l of lessons) {
    for (const m of l.body.matchAll(/(?:belief|number) (\d+), "([^"]+)"/g)) {
      const n = Number(m[1]);
      const title = m[2];
      if (BELIEFS[n] && BELIEFS[n] !== title) {
        wrong.push(`${n} is "${BELIEFS[n]}", not "${title}"`);
      } else if (byName[title] && byName[title] !== n) {
        wrong.push(`"${title}" is belief ${byName[title]}, not ${n}`);
      } else if (!BELIEFS[n] && !byName[title]) {
        // Neither side is one this test knows. Rather than pass silently, say
        // so: a citation nobody has checked is the thing being guarded against.
        wrong.push(`belief ${n} "${title}" is not in the checked list`);
      }
    }
  }
  ok(wrong.length === 0,
     wrong.length ? `a belief is misnumbered: ${wrong.join('; ')}` : 'and every belief number matches its real name');
}

// ---------------------------------------------------------------------------
// 3. NOT FILLER
// ---------------------------------------------------------------------------
//
// The old ones were around 360 characters. Length is a crude measure and it is
// the one that catches a silent revert to three pleasant sentences.
{
  const thin = lessons.filter((l) => l.body.length < 550);
  ok(thin.length === 0,
     thin.length
       ? `too thin to be a study: ${thin.map((l) => `${l.title} (${l.body.length})`).join('; ')}`
       : `every lesson has real substance (shortest ${Math.min(...lessons.map((l) => l.body.length))} characters)`);

  // A question the reader is actually asked. Without one it is a leaflet.
  const noQuestion = lessons.filter((l) => !l.body.includes('**To think about:**'));
  ok(noQuestion.length === 0, 'and every one asks the reader something rather than telling them');
}

// ---------------------------------------------------------------------------
// 4. THE EXPLORER'S SERIES USES NO INSIDE WORDS
// ---------------------------------------------------------------------------
//
//  These words are not
// wrong; they are a closed door to somebody who did not grow up with them. A
// person hears them and knows this was written for other people.
//
// THE CITATION IS EXEMPT, and deliberately. Belief 10 is really called "The
// Experience of Salvation" and naming it accurately matters more than dodging
// the word once. So the rule applies to the app's OWN VOICE -- everything
// before "Where this comes from:" -- and a quoted title is left alone.
{
  const INSIDE = [
    'salvation', 'saved', 'sinner', 'repentance', 'repent', 'grace',
    'righteousness', 'atonement', 'sanctification', 'redeemed', 'redemption',
    'testimony', 'fellowship', 'backslid', 'born again', 'the Lord',
    'doctrine', 'gospel', 'scripture', 'holy spirit', 'blessed',
  ];
  const explorer = lessons.filter((l) => l.series === EXPLORER);
  ok(explorer.length === 6, `the Explorer's series has six lessons (${explorer.length})`);

  const offenders = [];
  for (const l of explorer) {
    const voice = l.body.slice(0, l.body.indexOf('**Where this comes from:**')).toLowerCase();
    for (const w of INSIDE) if (voice.includes(w.toLowerCase())) offenders.push(`${l.title}: "${w}"`);
  }
  ok(offenders.length === 0,
     offenders.length
       ? `inside words in the Explorer's series: ${offenders.join('; ')}`
       : `no inside words anywhere in the Explorer's series (${INSIDE.length} checked)`);
}

// ---------------------------------------------------------------------------
// 5. AND IT IS ABOUT CHRIST
// ---------------------------------------------------------------------------
//
// Explorer studies centre more on Christ than on church doctrine. So the test
// counts, rather than trusting the title.
{
  const explorer = lessons.filter((l) => l.series === EXPLORER);
  const aboutHim = explorer.filter((l) => /\bJesus\b/.test(l.body));
  ok(aboutHim.length >= 5,
     `${aboutHim.length} of the Explorer's six lessons are about Jesus by name`);

  const series = sql.match(/update public\.lesson_series set\s*\n\s*title = '([^']+)'/);
  ok(series && /Jesus/.test(series[1]),
     `and the series says so in its title ("${series ? series[1] : '?'}")`);

  // The Adventist distinctives still exist -- they are simply not what an
  // Explorer meets first. Rest, the future and the body each keep a series.
  ok(/Rest, and the day built for it/.test(sql), 'rest still has its own series');
  ok(/The body, and looking after it/.test(sql), 'and so does the body');
  ok(/What comes next, read calmly/.test(sql), 'and what comes next');
}

// ---------------------------------------------------------------------------
// 6. NOBODY'S OWN COPY IS TOUCHED
// ---------------------------------------------------------------------------
//
// A member who edited one of these has their own row, with `copied_from`
// pointing at the original. Updating the originals by id leaves those alone;
// anything that wrote by title or deleted and re-inserted would not.
ok(!/delete from public\.lessons/i.test(sql), 'no lesson row is deleted');
ok(!/insert into public\.lessons/i.test(sql), 'and none is re-created with a new id');
ok(!/copied_from/i.test(sql), 'and nobody’s own copy is written to');

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);

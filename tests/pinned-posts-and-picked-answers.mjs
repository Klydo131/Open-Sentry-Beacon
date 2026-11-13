// Two small things that both destroy data when done carelessly.
//
// 1. GENDER AND STATUS BECAME LISTS. They were open text boxes, and six people
//    had already answered: `Female`, `male`, `M` for one, `Married`, `S` for
//    the other. Five shapes from six people, which is what an open box gets you.
//
//    THE DANGER IS THE MIGRATION, NOT THE LIST. A `select` whose value is `M`
//    renders as its FIRST option, so the next time that person saves anything
//    at all their answer silently becomes "Male" — or blank. They were never
//    asked and never told. So the list must carry an unrecognised answer, and
//    that is what `optionsFor` is for and what this checks.
//
// 2. A DIRECTOR CAN PIN A POST. Through a function rather than by widening
//    `blog_edit`, because the point is that a Director decides what the church
//    leads with INCLUDING on a post somebody else wrote — and widening the
//    policy to allow that would also let leadership rewrite anybody's words.
//
//   node tests/pinned-posts-and-picked-answers.mjs
//
// Reads the source and the migration; needs no database and no browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENDER_OPTIONS, LIFE_STATUS_OPTIONS, optionsFor, selectedValue }
  from '../lib/about-you.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

// ---- The lists themselves ----
ok(GENDER_OPTIONS.includes('Male') && GENDER_OPTIONS.includes('Female'),
   'gender offers Male and Female');
for (const s of ['Single', 'Married', 'Widowed', "It's complicated"]) {
  ok(LIFE_STATUS_OPTIONS.includes(s), `status offers ${s}`);
}

// ---- AN ANSWER GIVEN BEFORE THE LIST EXISTED IS NEVER LOST ----
// These are the real values sitting in the live table.
for (const [list, saved] of [[GENDER_OPTIONS, 'M'], [LIFE_STATUS_OPTIONS, 'S']]) {
  ok(optionsFor(list, saved).includes(saved), `an existing answer "${saved}" stays in the list`);
  ok(selectedValue(list, saved) === saved, `and stays selected`);
}
// And a differently-spelled answer matches instead of being added twice.
ok(selectedValue(GENDER_OPTIONS, 'male') === 'Male', '"male" selects Male');
ok(optionsFor(GENDER_OPTIONS, 'male').length === GENDER_OPTIONS.length,
   'and is not added a second time');
ok(selectedValue(LIFE_STATUS_OPTIONS, 'Married') === 'Married', '"Married" selects Married');
// Nobody is forced to answer.
ok(selectedValue(GENDER_OPTIONS, '') === '', 'an unanswered question stays unanswered');

// ---- The screens use them ----
for (const [file, label] of [
  ['components/LiveAccountPages.tsx', 'the profile screen'],
  ['components/live/DoorPages.tsx', 'the sign-up form'],
]) {
  const src = read(file);
  ok(/GENDER_OPTIONS/.test(src) && /LIFE_STATUS_OPTIONS/.test(src), `${label} uses the lists`);
  ok(/optionsFor\(/.test(src), `${label} widens them with the saved answer`);
  ok(/<select/.test(src), `${label} renders a dropdown`);
  ok(/<option value="">/.test(src), `${label} still allows no answer`);
}

// ---- Pinning ----
const dir = 'supabase/migrations';
const file = fs.readdirSync(path.join(root, dir))
  .filter((f) => f.includes('director_can_pin_a_post')).sort().pop();
ok(!!file, `the pin migration is present (${file ?? 'MISSING'})`);
const sql = file ? read(`${dir}/${file}`) : '';

ok(/add column if not exists pinned_at/.test(sql), 'blog_posts gains pinned_at');
ok(/order by b\.pinned_at desc nulls last, b\.created_at desc/.test(sql),
   'the feed puts pinned posts first and keeps date order under them');
ok(/role not in \('admin', 'executive'\)/.test(sql), 'only leadership may pin');
ok(/church_id is distinct from v_post\.church_id/.test(sql),
   'and only in the post’s own church, taken from the post rather than an argument');
ok(/A draft cannot be pinned/.test(sql), 'a draft cannot be pinned to the top of a feed');
// Dropping a function drops its grants, and a feed nobody may execute is a
// blank church page for everybody.
ok(/grant execute on function public\.blog_feed\(integer\) to authenticated/.test(sql),
   'and the rebuilt feed is granted back to authenticated');

const feed = read('components/LiveBlog.tsx');
ok(/live\.setPostPinned\(/.test(feed), 'the feed can pin');
ok(/profile\?\.role === 'admin' \|\| profile\?\.role === 'executive'/.test(feed),
   'and only shows the control to leadership');
ok(/Start here/.test(feed), 'a pinned post says why it is first');
ok(/Pin to the top for new members/.test(feed), 'and the control says what it does');

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);

// A hub is kept running by its members' gifts.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 26 October 2026: "There must be some kind of donation system to
// maintain the standard maintenance of the app ... Can we make a plan and
// system of it?" The owner's choices: gifts go to each church's own treasury;
// members give through the church's own GCash or bank, with nothing paid in the
// app; members see the month's goal and total, and no names.
//
// THEN, THE SAME DAY: "Donation features are only optional if developers want
// to put it on their own home brewed Hope Beacon." So giving is off until a
// project sets HUB_GIVING = 'on' (20261026200000_giving_is_a_choice), and the
// sample church, which is the app as it comes, has no giving card.
//
// WHAT HOLDS, each checked below and each broken on purpose once to watch the
// check go red. Who may do what is proved by running it, as invented people,
// in supabase/tests/a-hub-is-kept-running-by-gifts.sql, which this checks is
// run.
//
//   node tests/a-hub-is-kept-running-by-gifts.mjs
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

const m = sql('supabase/migrations/20261026120000_a_hub_is_kept_running_by_gifts.sql');
const fnOf = (name) => new RegExp(`function ${name.replace('.', '\\.')}\\([\\s\\S]*?\\$\\$;`).exec(m)?.[0] ?? '';
const screens = code('components/live/HubGiving.tsx');
const calls = code('lib/live/giving.ts');

// 0. Optional, and off as the app comes.
const choice = sql('supabase/migrations/20261026200000_giving_is_a_choice.sql');
const choiceFn = (name) => new RegExp(`function ${name.replace('.', '\\.')}\\([\\s\\S]*?\\$\\$;`).exec(choice)?.[0] ?? '';
ok(/s\.key = 'HUB_GIVING'/.test(choiceFn('private.hub_giving_on')) && /= 'on'/.test(choiceFn('private.hub_giving_on')),
  'giving is on only where the project has set HUB_GIVING = on; no row means off');
ok(/and private\.hub_giving_on\(\)/.test(choiceFn('private.hub_my_church')),
  'switched off, no caller has a church for giving, so every giving function refuses');
ok(/if not private\.hub_giving_on\(\) then\s+return jsonb_build_object\('enabled', false\)/.test(choiceFn('public.hub_giving_card')),
  'switched off, the card says so instead of failing');
ok(/revoke all on function private\.hub_giving_on\(\)\s+from public, anon, authenticated;/.test(choice),
  'nobody signed in can ask the switch directly');
ok(/card\?\.enabled === false\) return null/.test(calls),
  'the screens treat a switched-off project as no giving at all');
ok(!/GivingCardView|HubGiving/.test(code('app/church/page.tsx')),
  'the sample church, which is the app as it comes, shows no giving card');

// 1. The tables are locked, and keep no giver.
ok(/revoke all on public\.hub_giving, public\.hub_treasurers, public\.hub_gifts from public, anon, authenticated/.test(m)
  && ['hub_giving', 'hub_treasurers', 'hub_gifts'].every((t) => new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(m))
  && !/create policy/.test(m),
  'the three tables are locked: no policy, no grant; the functions are the only way in');
const gifts = /create table if not exists public\.hub_gifts \(([\s\S]*?)\n\);/.exec(m)?.[1] ?? '';
ok(gifts && !/\b(giver|given_by|donor|person_id|member_id|from_person)\b/.test(gifts),
  'a gift is an amount, a day, a way and a note: no column says who gave');

// 2. What members see.
const card = fnOf('public.hub_giving_card');
ok(/private\.hub_my_church\(\)/.test(card) && /given_this_month/.test(card) && !/hub_gifts\b/.test(card.replace(/hub_month_total/g, '')),
  'the card gives a member the month\'s total, never a gift');
ok(/p\.is_approved\s+and p\.suspended_at is null/.test(fnOf('private.hub_my_church')),
  'only an approved, unsuspended member of the church has a card');

// 3. Directors and treasurers.
ok(/not private\.hub_i_lead\(\)/.test(fnOf('public.hub_giving_save'))
  && /not private\.hub_i_lead\(\)/.test(fnOf('public.hub_treasurer_name'))
  && /not private\.hub_i_lead\(\)/.test(fnOf('public.hub_treasurer_remove')),
  'only a Director sets giving up and names or removes treasurers');
ok(/p\.church_id = c\s+and p\.is_approved and p\.suspended_at is null/.test(fnOf('public.hub_treasurer_name')),
  'a treasurer must be an approved, unsuspended member of the same church');
ok(['public.hub_gift_record', 'public.hub_gift_remove', 'public.hub_gifts_list']
  .every((f) => /not private\.hub_i_keep_the_books\(\)/.test(fnOf(f))),
  'only a treasurer records a gift, takes one back or sees each one');
ok(/t\.church_id = p\.church_id/.test(fnOf('private.hub_i_keep_the_books')),
  'a treasurer who moves church keeps no books for the old one');
ok(/p_received_on > today/.test(fnOf('public.hub_gift_record')), 'no gift is dated in the future');
ok(/data:image\/\(png\|jpeg\|webp\);base64/.test(m), 'the QR code can only be a picture');

// 4. Grants.
const fns = ['hub_giving_card()', 'hub_giving_save(text, numeric, text, text, text, text, text, text, text)',
  'hub_treasurers_list()', 'hub_treasurer_name(uuid)', 'hub_treasurer_remove(uuid)',
  'hub_gift_record(numeric, date, text, text)', 'hub_gift_remove(uuid)', 'hub_gifts_list(text)'];
const esc = (s) => s.replace(/[()]/g, '\\$&');
ok(fns.every((f) => new RegExp(`revoke all on function public\\.${esc(f)}\\s+from public, anon;`).test(m)
    && new RegExp(`grant execute on function public\\.${esc(f)}\\s+to authenticated;`).test(m)),
  'every function is for signed-in people only');
ok(['hub_today()', 'hub_my_church()', 'hub_i_lead()', 'hub_i_keep_the_books()', 'hub_month_total(uuid, date)']
  .every((f) => new RegExp(`revoke all on function private\\.${esc(f)}\\s+from public, anon, authenticated;`).test(m)),
  'the private helpers answer nobody directly');

// 5. No money moves through the app.
ok(!/paymongo|xendit|stripe|paypal|checkout|card_number|fetch\(/i.test(screens + calls),
  'the screens call no payment service and take no card: they show the church\'s own accounts');

// 6. The screens.
ok(/if \(!card\.set_up\) \{[\s\S]{0,200}if \(!card\.i_lead\) return null;/.test(screens),
  'Home shows nothing until it is set up, and only a Director is told it can be');
ok(/card\.i_keep_the_books && card\.set_up && <GiftBook/.test(screens) && /card\.i_lead && <GivingSetup/.test(screens),
  'the gift book is for treasurers, the setup for Directors');
const view = /export function GivingCardView[\s\S]*?\n}\n/.exec(screens)?.[0] ?? '';
ok(view && !/gifts|recorded_by|GiftBook/.test(view), 'the card a member sees draws no gift and no name');
ok(/giving\.i_lead \|\| giving\.i_keep_the_books/.test(code('components/LiveAccountPages.tsx')),
  'Settings offers the Giving folder only to Directors and treasurers');
ok(/<LiveHubGivingCard \/>/.test(code('components/LiveChurchPages.tsx')),
  'where giving is switched on, the card is on Home in the live church');

// 7. Proved on every fresh install, and written down.
ok(/supabase\/tests\/a-hub-is-kept-running-by-gifts\.sql/.test(read('scripts/fresh-install.sh')),
  'the database proof runs on every fresh install (and so in CI)');
ok(/Keep our Hope Hub running/.test(read('docs/HANDBOOK.md')) && /Giving/.test(read('docs/HOW-TO-USE.md')),
  'the Handbook and How-To-Use say how it works');
ok(/HUB_GIVING/.test(read('docs/HANDBOOK.md')) && /HUB_GIVING/.test(read('CHANGELOG.md')),
  'and the Handbook and the changelog say how a project switches it on');

console.log(bad ? `\nRESULT: ${bad} FAILED` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);

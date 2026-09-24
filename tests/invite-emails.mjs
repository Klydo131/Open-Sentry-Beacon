// Render all three invitations and look at what comes out.
//
// This composer runs in Deno inside an edge function, so nothing else in this
// repository ever executes it. That is exactly why it needs a test: a mistake
// here is invisible until a stranger being invited to a church receives a
// broken message, and by then the only person who can report it is the person
// we were trying not to confuse.
//
// It is transpiled and RUN rather than read as text. Checking the source for
// the string "Explorer" proves nothing about what a recipient sees; three real
// renders do.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const SRC = 'supabase/functions/invite/email.ts';
const js = ts.transpileModule(readFileSync(SRC, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { inviteHtml, inviteText, subjectFor, roleWord } = mod.exports;

// All four. A role the composer does not cover renders as undefined and
// sends a blank message, which is exactly the failure this file exists for.
const ROLES = ['ds', 'dm', 'admin', 'executive'];
// A NEUTRAL HOST, deliberately. tests/no-backend.js forbids this deployment's
// hostname anywhere in the tree, because a fork that inherits it inherits a
// wrong address in a place nobody thinks to look. Any absolute URL proves the
// same property here.
// NO LONGER A TOKEN. The invitation carries a password, so the address in the
// message is the ordinary sign-in page with the person's own e-mail in it.
const URL_ = 'https://church.example.org/login?email=someone%40example.org';
const APP_URL = 'https://church.example.org';
const CHURCH = 'Open Sentry Beacon Demo Church';
// A NAME, because the invitation greets by one now. It is an obvious
// placeholder: this repository is public and nothing in it names a real
// member of a real church.
const NAME = 'Maria Santos';
const SIGN_IN_EMAIL = 'someone@example.org';
const TEMP_PASSWORD = 'coral-anchor-cedar-482';

// ---------------------------------------------------------------------------
// Every role renders, and renders differently.
// ---------------------------------------------------------------------------
const bodies = {};
for (const role of ROLES) {
  const html = inviteHtml(role, CHURCH, URL_, APP_URL, SIGN_IN_EMAIL, TEMP_PASSWORD, NAME);
  bodies[role] = html;
  ok(typeof html === 'string' && html.length > 800, `${role}: renders a real message`);

  // THE INSTALL INSTRUCTIONS ARE GONE, AND THAT IS THE POINT OF THIS BLOCK.
  //
  // They were most of the message: Safari steps, other-browser steps, a "using
  // the app" panel and a three-step list, all written for somebody being walked
  // through their first day. The whole thing came to 13,000 characters, and the
  // first invitation that reached a real inbox landed in Gmail's PROMOTIONS tab
  // rather than Primary -- a wall of sections and buttons reads as marketing to
  // a classifier however transactional every word of it is.
  //
  // So the message now carries what cannot be got anywhere else -- the address,
  // the password, the warning and the way in -- and the install steps live in
  // the app under Settings, which is where somebody is standing when they
  // actually want them.
  //
  // CHECKED AS AN ABSENCE, deliberately. These assertions used to require the
  // install steps and their ordering, and each of those rules came from a real
  // failure. Deleting the checks silently would throw away the record; asserting
  // the absence keeps it, and stops the wall growing back a section at a time.
  ok(!html.includes('Safari on iPhone or iPad') && !html.includes('Other browsers'),
     `${role}: carries no install instructions`);
  ok(!html.includes('Using the app'),
     `${role}: and no "using the app" tour`);
  ok(html.includes('open <strong>Settings</strong> inside the app'),
     `${role}: it points at Settings instead, where installing is explained`);

  // THE OLD ORDERING BUG CANNOT RECUR, and it is worth naming what it was. The
  // install steps used to come FIRST; people followed them, an installed app
  // opens as a fresh session with no invitation in it, and some never went back
  // to the e-mail. One Guide ended with an account that had no password and a
  // spent link, repaired by hand against the database. With no install section
  // at all there is nothing left to come first.
  ok(!/install/i.test(html.slice(0, html.indexOf('Sign in to Hope Beacon'))),
     `${role}: nothing about installing appears before the way in`);

  // ONE LINK PER DESTINATION. The copyable fallback address was removed with
  // the rest: it duplicated the button, and two links to the same place is
  // itself a bulk-mail signal. The bare URL still exists for anybody whose
  // client will not render the button -- in the PLAIN TEXT part, checked below,
  // which is a better place for it than a second line of HTML.
  ok(!html.includes('If the button does not work'),
     `${role}: no duplicate fallback address in the HTML`);
  const hrefs = (html.match(/href="https:\/\/church\.example\.org[^"]*"/g) || []).length;
  ok(hrefs === 2,
     `${role}: exactly two links -- the way in and the password page (${hrefs})`);

  // -------------------------------------------------------------------------
  // THE PLAIN TEXT PART
  // -------------------------------------------------------------------------
  //
  // A message with only an HTML part is one of the signals Gmail weighs between
  // Primary and Promotions: ordinary correspondence is multipart, bulk mail very
  // often is not. It is also what a client with styling switched off, a watch,
  // and a screen reader all get.
  {
    const text = inviteText(role, CHURCH, URL_, APP_URL, SIGN_IN_EMAIL, TEMP_PASSWORD, NAME);
    ok(text.length > 400, `${role}: there is a real plain-text version (${text.length} chars)`);
    ok(!/<[a-z]/i.test(text), `${role}: with no markup left in it`);
    ok(!/&(amp|nbsp|middot|rsquo);/.test(text),
       `${role}: and no HTML entities, which are a bug in plain text rather than a safety measure`);
    ok(text.includes(SIGN_IN_EMAIL) && text.includes(TEMP_PASSWORD),
       `${role}: it carries the address and the password`);
    ok(text.includes(`${APP_URL}/password`), `${role}: and the page that changes it`);
    ok(text.includes(URL_.split('#')[0]), `${role}: and the way in, as a bare address`);
    // Wrapped by a function rather than by hand: the first draft broke lines
    // wherever the source happened to end and left "inside the app." alone.
    const longest = Math.max(...text.split('\n').map((l) => l.length));
    ok(longest <= 72, `${role}: wrapped for a narrow window (longest line ${longest})`);
  }

  // -------------------------------------------------------------------------
  // THE CREDENTIALS, IN THE RENDERED MESSAGE, ABOVE THE BUTTON
  // -------------------------------------------------------------------------
  //
  // "That email and password must be emphasized first before tapping the accept
  // or join in to the Web app." Checked on the real render rather than on the
  // source, because that is what a person receives. tests/the-invitation-carries
  // -a-password.mjs reads the source; this one runs it, and this file exists
  // precisely because reading proves nothing about what comes out.
  //
  // THIS SUITE IS ALSO WHAT CAUGHT THE SIGNATURE CHANGE. When inviteHtml gained
  // two parameters, the source-reading test still passed and this one threw on
  // the first render -- undefined reaching esc(). A rendering test earns its
  // keep on exactly that class of mistake.
  ok(html.includes(SIGN_IN_EMAIL), `${role}: shows the address they sign in with`);
  ok(html.includes(TEMP_PASSWORD), `${role}: and the password itself`);
  const invitationButton = html.indexOf('Sign in to Hope Beacon');
  ok(html.indexOf(SIGN_IN_EMAIL) < invitationButton
     && html.indexOf(TEMP_PASSWORD) < invitationButton,
     `${role}: both appear ABOVE the button, which is the whole request`);
  ok(html.includes('Step 1') && html.includes('Step 2')
     && html.indexOf('Step 1') < html.indexOf('Step 2'),
     `${role}: and the two steps are numbered in order`);

  // The warning has to travel with the password, not sit in a footer.
  const warn = html.indexOf('This password is temporary');
  ok(warn > 0 && warn < invitationButton,
     `${role}: the temporary-password warning sits with the password`);
  // IT NAMES A PLACE, NOT DIRECTIONS. This used to look for the words
  // "Settings" and "Change password", which was the best available check while
  // the form was a card inside a folder inside Settings and had no address of
  // its own. It has one now, so the message can point at it -- and an address
  // in an e-mail is something a person can tap, which a set of directions is
  // not.
  ok(html.includes(`${APP_URL}/password`),
     `${role}: and links straight to the page that changes it`);
  ok(/<a href="[^"]*\/password"/.test(html),
     `${role}: as a real link rather than text somebody has to retype`);

  // Nothing may still promise a one-time link. A false reassurance about
  // expiry is how somebody decides not to bother today.
  ok(!/works\s*<strong>once<\/strong>/.test(html) && !html.includes('link works once'),
     `${role}: nothing claims the link works only once any more`);

  ok(html.includes(CHURCH), `${role}: names the church`);
  ok(html.includes(roleWord(role)), `${role}: says which role they were invited as`);

  // NOTHING UNSUBSTITUTED MAY REACH A READER. The whole point of composing here
  // rather than in a template engine is that no placeholder syntax survives.
  ok(!/\{\{|\}\}|\{%/.test(html), `${role}: no template placeholder survives into the message`);
}

// The three must actually differ. A shared shell is fine; identical bodies are
// the bug this whole file exists to prevent.
ok(bodies.ds !== bodies.dm && bodies.dm !== bodies.admin && bodies.ds !== bodies.admin,
   'the three roles produce three different messages');

// ---------------------------------------------------------------------------
// Subjects differ, and that is not cosmetic.
// ---------------------------------------------------------------------------
// Gmail threads by subject and collapses a later message behind "Show quoted
// text" when it resembles an earlier one in the thread. Two invitations to one
// person then read as one invitation and one blank message -- which is exactly
// what happened here and cost a morning.
const subjects = ROLES.map(subjectFor);
ok(new Set(subjects).size === ROLES.length,
   'each role has its own subject, so Gmail cannot collapse one into another');
ok(subjects.every((s) => s && s.length > 8), 'no subject is empty or a stub');

// ---------------------------------------------------------------------------
// A church name from the database is escaped.
// ---------------------------------------------------------------------------
// churches.name is set by an Executive Director, so it is not attacker-supplied
// in the usual sense -- but it is user input reaching an HTML document, and the
// cost of being wrong is a broken or hostile email sent to a congregation.
const nasty = inviteHtml('ds', 'St <script>alert(1)</script> "Mary" & Co', URL_, APP_URL, SIGN_IN_EMAIL, TEMP_PASSWORD, NAME);
ok(!nasty.includes('<script>'), 'a church name cannot inject a tag');
ok(nasty.includes('&lt;script&gt;'), 'the angle brackets are escaped rather than dropped');
ok(nasty.includes('&quot;Mary&quot;') && nasty.includes('&amp; Co'),
   'quotes and ampersands are escaped too, so the markup around them cannot break');

// AND SO ARE THE CREDENTIALS. The generator only makes lowercase words, digits
// and hyphens, so nothing dangerous can reach here today -- which is exactly
// the reasoning that stops being true the day somebody changes the generator.
// The escaping is what makes that change safe rather than a surprise.
{
  const odd = inviteHtml('ds', CHURCH, URL_, APP_URL,
    'a<b>@example.org', 'pass"&<word>-123', NAME);
  ok(!odd.includes('<b>@example.org'), 'an address with a tag in it cannot inject one');
  ok(odd.includes('&lt;word&gt;') && odd.includes('&quot;'),
     'and a password with markup characters is escaped, not rendered');
}

// ---------------------------------------------------------------------------
// The empty church name still reads as a sentence.
// ---------------------------------------------------------------------------
// A church row with no name is a real state during setup, and "  has invited
// you" is the kind of thing that ships because nobody rendered the blank case.
const blank = inviteHtml('ds', '', URL_, APP_URL, SIGN_IN_EMAIL, TEMP_PASSWORD, NAME);
ok(blank.includes('Your church'), 'a missing church name falls back to readable words');
ok(!/>\s*has invited you/.test(blank.replace(/<strong[^>]*>[^<]*<\/strong>/g, 'X')),
   'and never leaves a sentence starting mid-air');

// ---------------------------------------------------------------------------
// Email clients: tables and inline styles only.
// ---------------------------------------------------------------------------
for (const role of ROLES) {
  const html = bodies[role];
  ok(!/<style[\s>]/i.test(html), `${role}: no <style> block, which several clients drop`);
  ok(!/display:\s*(flex|grid)/i.test(html), `${role}: no flexbox or grid, which Outlook cannot lay out`);
  ok(!/<img[\s>]/i.test(html), `${role}: no image, which most clients block by default`);
}

// ---------------------------------------------------------------------------
// The message matches who is actually let straight in.
// ---------------------------------------------------------------------------
//
// `handle_new_user` approves an arriving account automatically only when the
// invited role is Explorer or Executive Director. A Guide or a Director signs
// in with the password that worked, and meets "Your account is not approved
// yet" -- while the message they are holding says there is nothing to set up.
//
// That reads as a broken password, which is the one thing this whole change
// exists to stop somebody believing. So the two roles that wait are told they
// wait, and the two that do not are NOT told, because for them it is untrue and
// an invented delay costs the same trust in the other direction.
{
  const WAITS = /A Director then lets you in/;
  for (const role of ['dm', 'admin']) {
    ok(WAITS.test(bodies[role]),
       `${role}: is told a Director still has to let them in, because they are not approved on arrival`);
  }
  for (const role of ['ds', 'executive']) {
    ok(!WAITS.test(bodies[role]),
       `${role}: is NOT told to wait, because they are approved the moment they sign in`);
  }
}


// ---------------------------------------------------------------------------
// THE GREETING, which is the whole point of reading names out of a file.
// ---------------------------------------------------------------------------
//
// THE ASK: a list is uploaded as Name, Email, Role "in that way it will be more
// customize for the email greetings." Reading the name was only half of that.
// Until this, the name reached the recipient in exactly one place nobody looks
// at -- the display name on the To: line -- and the message itself opened with
// the church's name and never said theirs.
//
// AND WHY IT IS NOT ALWAYS THERE. The bulk panel falls back to the local part
// of the address when a row carries no name, so what arrives can be
// `stormwell88`. "Hi stormwell88," is worse than no greeting: it is the exact
// tell of a machine-generated message, in an e-mail already fighting to be read
// as correspondence rather than as a mailshot.
{
  const named = inviteHtml('ds', CHURCH, URL_, APP_URL, SIGN_IN_EMAIL, TEMP_PASSWORD, 'Maria Santos');
  ok(named.includes('Hi Maria,'), 'the invitation greets by first name');
  ok(!named.includes('Hi Maria Santos,'),
     'and by the FIRST name only, because the full one reads like a summons');
  ok(named.indexOf('Hi Maria,') < named.indexOf('has invited you'),
     'the greeting opens the message rather than turning up underneath it');

  const text = inviteText('ds', CHURCH, URL_, APP_URL, SIGN_IN_EMAIL, TEMP_PASSWORD, 'Maria Santos');
  ok(text.includes('Hi Maria,'), 'and the plain-text half is greeted too, not just the HTML');

  // What a row with no name produces once the panel has fallen back.
  for (const notAName of ['stormwell88', 'maria.santos', 'a', '', '   ', 'x@y.org']) {
    const anon = inviteHtml('ds', CHURCH, URL_, APP_URL, SIGN_IN_EMAIL, TEMP_PASSWORD, notAName);
    ok(!/Hi\s/.test(anon.replace(/<[^>]*>/g, '')),
       `"${notAName}" is not a name, so there is no greeting rather than a bad one`);
  }
  ok(!inviteText('ds', CHURCH, URL_, APP_URL, SIGN_IN_EMAIL, TEMP_PASSWORD, '').includes('Hi'),
     'and the text half leaves no stray "Hi ," behind either');

  // A list typed in lower case is normal and should still read as a name.
  ok(inviteHtml('ds', CHURCH, URL_, APP_URL, SIGN_IN_EMAIL, TEMP_PASSWORD, 'maria santos')
     .includes('Hi Maria,'), 'a lower-case name is capitalised');
  ok(inviteHtml('ds', CHURCH, URL_, APP_URL, SIGN_IN_EMAIL, TEMP_PASSWORD, "O'Brien")
     .includes("Hi O&#39;Brien,") || inviteHtml('ds', CHURCH, URL_, APP_URL, SIGN_IN_EMAIL, TEMP_PASSWORD, "O'Brien")
     .includes("Hi O'Brien,"), 'and a name that came with capitals keeps them');

  // The name comes off a file somebody uploaded, so it is user input reaching
  // an HTML document by the shortest possible route.
  //
  // TWO LAYERS, AND ONLY ONE OF THEM CAN BE PROVED BY RENDERING. The filter is
  // what actually stops this: `<script>` is not letters, so it is not a name,
  // so there is no greeting to inject into. The escaping behind it has nothing
  // to do given that filter -- the only characters it admits are letters, an
  // apostrophe and a hyphen, and esc() touches none of them -- so no render can
  // show it working. It is checked in the source instead, because the day
  // somebody widens the filter is the day it stops being unreachable, and a
  // check that says "the escaping is there" is worth having on that day.
  const hostile = inviteHtml('ds', CHURCH, URL_, APP_URL, SIGN_IN_EMAIL, TEMP_PASSWORD,
    '<script>alert(1)</script>');
  ok(!hostile.includes('<script>alert(1)'),
     'markup is not a name, so it is never greeted with and cannot inject a tag');
  ok(!/Hi\s/.test(hostile.replace(/<[^>]*>/g, '')),
     'and no half-greeting is left behind when the name is thrown away');
  ok(/Hi \$\{esc\(hello\)\},/.test(readFileSync(SRC, 'utf8')),
     'and the greeting still goes through esc(), for the day the filter widens');

  // AND IT IS ACTUALLY SENT WITH ONE. Composing the greeting and passing the
  // name to the composer are two different things, and the second is a single
  // argument that a refactor drops without any of the above going red.
  const fn = readFileSync('supabase/functions/invite/index.ts', 'utf8');
  ok(/inviteHtml\(asRole, churchName, joinUrl, site, email, tempPassword, fullName\)/.test(fn),
     'the send hands the name to the HTML half');
  ok(/inviteText\(asRole, churchName, joinUrl, site, email, tempPassword, fullName\)/.test(fn),
     'and to the plain-text half');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);

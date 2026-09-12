// One command that runs every guard, so nobody has to remember the list.
//
//   npm run verify        static guards only — no server, no browser, ~30s
//   npm run verify:all    the above plus every end-to-end walk (~4 min)
//
// Why this exists: the checks were all here already and all run by hand, which
// meant in practice they ran when someone remembered, which meant a stale
// assertion could sit green-looking for weeks. Three of them had drifted so far
// they were asserting the *opposite* of what had been asked for, and the only
// reason anyone noticed was an unrelated investigation.
//
// The e2e half also owns the server lifecycle, because doing that by hand is
// its own source of wrong answers: `next start` exits 1 when a previous
// next-server still holds the port, and a stale server happily answers on the
// old build so the suite passes against code that no longer exists. This picks
// a free port, waits for the build id it just built, and always tears down.

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const withE2e = process.argv.includes('--all');
const results = [];

// On Windows, `npm` and `npx` are `npm.cmd` / `npx.cmd`, and Node refuses to
// execute a .cmd without a shell — it has done since the CVE-2024-27980
// hardening, so even setups that once worked now fail. Without this, the very
// first thing a Windows contributor runs, `npm run verify`, dies at step one
// with a bare ENOENT that says nothing about the cause.
//
// Gated on win32 rather than always-on: `shell: true` changes argument parsing,
// and there is no reason to take that risk on the platforms where it is not
// needed. Every argument passed here is a bare flag or word with no spaces, so
// there is nothing for the Windows shell to mis-split.
const NEEDS_SHELL = process.platform === 'win32';

function run(label, cmd, args, opts = {}) {
  process.stdout.write(`\n─── ${label} ${'─'.repeat(Math.max(0, 56 - label.length))}\n`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: NEEDS_SHELL && (cmd === 'npm' || cmd === 'npx'),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    ...opts,
  });
  const passed = r.status === 0;
  results.push({ label, passed });
  return passed;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForBuild(port, expected, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/version.json`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const body = await res.json();
        // The build id is the whole point of the wait. A server that answers
        // with a different one is a stale process, and running the suite
        // against it is how you "verify" code that is not deployed.
        if (!expected || body.build === expected) return true;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ---------------------------------------------------------------- static ----

run('typecheck', 'npx', ['tsc', '--noEmit']);
run('build', 'npm', ['run', 'build']);

const staticChecks = [
  ['no secrets', 'tests/no-secrets.js'],
  ['no backend, no pipelines', 'tests/no-backend.js'],
  ['test portability', 'tests/test-portability.mjs'],
  ['brand consistency', 'tests/brand-consistency.mjs'],
  // brand-consistency only ever compared the LOGO DRAWING between its copies --
  // it never looked at the name, while lib/brand.ts claimed it did. This is the
  // check that claim described: the old name is gone everywhere, the two
  // localStorage ADDRESSES that carry it survived untouched, and the
  // hard-coded surface is pinned so it cannot grow behind a promise again.
  ['the brand is one name', 'tests/the-brand-is-one-name.mjs'],
  ['media guardrails', 'tests/media-guardrails.js'],
  // Reads the CSP header itself. Every live data call is made from the browser,
  // so a policy that omits the backend origin kills the whole app in the
  // console — where nothing else in this suite is looking.
  ['backend CSP', 'tests/backend-csp.mjs'],
  ['real-time and pairing media', 'tests/realtime-and-media.mjs'],
  ['update floor', 'tests/min-build.mjs'],
  // The auto-update policy, asserted both ways. The browser suite can only
  // prove the half where an update is BLOCKED, and a guard that blocks forever
  // passes that half too — so the decision itself is a pure function and both
  // answers are checked here.
  ['auto-update policy', 'tests/auto-update-policy.mjs'],
  ['analytics over time', 'tests/analytics-trend.mjs'],
  ['security invariants', 'tests/security-invariants.mjs'],
  // What a visitor who has NOT signed in can touch. Supabase grants the
  // anonymous role everything on every new table and RLS is what takes it back,
  // so a policy written without a TO clause quietly applies to the whole
  // internet. Sweeps every migration rather than a list of tables somebody
  // remembered to add — which is how it caught three the audit had missed.
  ['the signed-out role', 'tests/the-signed-out-role.mjs'],
  // What an Explorer's shelf opens with. The kit is shown to everybody, and it
  // grew into a twenty-item reference shelf that opened with three Bibles and
  // closed with a lesson archive. That is a filing cabinet, not a welcome, so
  // an Explorer now gets a short Jesus-first list -- and this keeps it short.
  ['the Explorer starts with Jesus', 'tests/the-explorer-starts-with-jesus.mjs'],
  // Dead link, or a publisher that dislikes robots? The shelf checker cannot
  // reach the internet from here and runs in CI instead, but the rule it sorts
  // by can be tested anywhere -- and it is the part that was wrong, calling
  // three live sites dead because they answer 403 to a datacentre.
  ['dead is not refused', 'tests/dead-is-not-refused.mjs'],
  // An alert a phone will actually show. Chrome on Android refuses the
  // Notification constructor outright, so the live settings screen said "On"
  // and showed nothing -- on a desktop it worked, which is how it survived.
  ['notifications go through the worker', 'tests/notifications-go-through-the-worker.mjs'],
  // A study could be created, published and deleted but never corrected, so
  // fixing a typo meant deleting the study and losing every handout on it.
  // The database had always allowed the update; only the app was missing.
  ['a study can be corrected', 'tests/a-study-can-be-corrected.mjs'],
  // Live updates, both halves. One table was published for realtime and the
  // rest of the app only changed when somebody pressed refresh; a set naming a
  // table the migration does not publish is a screen subscribing to silence.
  ['the screen keeps up', 'tests/the-screen-keeps-up.mjs'],
  // The library could be added to and shared from and never tidied. The delete
  // policy had always allowed it; only the button was missing, which is a gap
  // that reports itself as nothing at all.
  ['a resource can be taken off the shelf', 'tests/a-resource-can-be-taken-off-the-shelf.mjs'],
  // ARCHITECTURE.md described an app with no backend for months after the live
  // half shipped, and nothing reported it. Stale documentation fails silently.
  ['the docs know what shipped', 'tests/the-docs-know-what-shipped.mjs'],
  // The white noise was nearly three times as loud as the gentle sounds from
  // the same slider, and nothing measured it. "Some of it are not pleasing."
  ['the ambience is pleasant', 'tests/the-ambience-is-pleasant.mjs'],
  // A Guide chosen on an invitation was never paired, because an invited
  // Explorer arrives already approved and the pairing hung off an approval.
  ['the named Guide is paired', 'tests/the-named-guide-is-paired.mjs'],
  // The invitation used to carry a one-time link that expired, was spent by
  // mail scanners, and failed on the second tap. It carries a password now.
  ['a first password', 'tests/a-first-password.mjs'],
  ['the invitation carries a password', 'tests/the-invitation-carries-a-password.mjs'],
  // The example studies cited nothing, which is what AI filler looks like.
  ['the studies are sourced', 'tests/the-studies-are-sourced.mjs'],
  // The add form never asked what a link was FOR, every row drew one button
  // per person, and the shelf could not be searched at any length.
  ['the library is easy to use', 'tests/the-library-is-easy-to-use.mjs'],
  // Every part of sharing-with-a-note was built except the box: the column,
  // the data layer and the Explorer's card were all ready, and the Guide's
  // screen never passed one. Twenty-two shares, twenty-two empty notes.
  ['a share can say why', 'tests/a-share-can-say-why.mjs'],
  // The "Maria has this" chip was fenced behind pairings.length === 1, so the
  // only Guide it spoke to was one carrying a single Explorer -- and a Guide
  // at the cap of five saw nothing. Their OWN shares only: a church-wide
  // total would cross the boundary migration 0008 states outright.
  ['a Guide sees who already has it', 'tests/a-guide-sees-who-already-has-it.mjs'],
  // The chat dock was `hidden xl:block`, so only a screen 1280px or wider got
  // the bubble and a phone was sent to /talk -- a page, which loses whatever
  // you were reading. One token, no error, invisible in review.
  ['the chat is a bubble everywhere', 'tests/the-chat-is-a-bubble-everywhere.mjs'],
  // Two permanent explanations took more room than the conversation they
  // explained -- 204 CSS pixels against 91 for the one message on screen --
  // and every bubble repeated the speaker's name and its own date.
  ['the thread reads like a conversation', 'tests/the-thread-reads-like-a-conversation.mjs'],
  // Emoji suggested from a colon, never from ordinary words: this is the box
  // somebody tells their Guide about a bereavement in. The trigger must also
  // refuse `Luke 4:18`, which is the likeliest false positive in a church.
  ['emoji are suggested as you type', 'tests/emoji-are-suggested-as-you-type.mjs'],
  // One way into the chat. The navigation row opened /talk as a page, which
  // cost somebody whatever they were reading -- the bubble opens over it. The
  // thread list must survive: auto-opening the first would strand a Guide in
  // one conversation with no way to the other four, and nothing would error.
  ['the chat is the bubble and it moves', 'tests/the-chat-is-the-bubble-and-it-moves.mjs'],
  // The appointments card kept nothing. 36 of 36 notes empty because there was
  // no box; a proposal nobody answered stopped being drawn once its date went
  // by, so a silence was delivered on somebody's behalf; and 33 meetings that
  // actually happened were invisible to the two people they happened between.
  ['an appointment is remembered', 'tests/an-appointment-is-remembered.mjs'],
  // read_at has been written since this app had messages and nothing ever drew
  // it. Built on the owner's decision, against a stated product rule -- so the
  // SHAPE is what is checked: one receipt, under the last thing you sent, never
  // a column of Seen down the thread and never on the other person's messages.
  ['you can tell whether it was read', 'tests/you-can-tell-whether-it-was-read.mjs'],
  // The Kind dropdown defaults to Link and sits below the address, so the
  // field was whatever the form defaulted to -- and then filter chips were
  // built on it, making a field nobody maintains into a control that lies.
  ['the shelf knows what it is holding', 'tests/the-shelf-knows-what-it-is-holding.mjs'],
  // An Explorer reads the studies; Guides, Directors and Executive Directors
  // write them. Two copies of one rule -- the policy and the screen.
  ['an Explorer reads the studies', 'tests/an-explorer-reads-the-studies.mjs'],
  // A study is marked read by the person who read it, and by nobody else, so a
  // Director's progress bar is evidence rather than an opinion. Checks the
  // policy that refuses a read written for somebody else AND the screens that
  // do not offer what would be refused.
  ['the reading is recorded', 'tests/the-reading-is-recorded.mjs'],
  // The shipping script hands `git status` paths straight to `git add`, and it
  // was reading them through a helper that trimmed -- which ate the first
  // character of the FIRST path whenever that entry was an unstaged edit. It
  // survived two ships and then killed a 25-minute gate run at the last step.
  ['the ship reads git correctly', 'tests/the-ship-reads-git-correctly.mjs'],
  // Evidence on a safeguarding report, and the authorisation around it: the
  // same rule as reports_read, which deliberately keeps it from the reporter
  // too, and no delete on either the row or the stored object.
  ['a report can carry evidence', 'tests/a-report-can-carry-evidence.mjs'],
  // The join screen shown to a room without a live link and without creating
  // anything. The whole value rests on it being incapable of writing, and that
  // is invisible on screen, so it is checked rather than trusted.
  ['the sign-up can be shown', 'tests/the-sign-up-can-be-shown.mjs'],
  // Gender and Status as lists, and a Director pinning a post. Both are small
  // and both destroy data done carelessly: a select holding an unrecognised
  // saved answer silently rewrites it on the next save.
  ['pinned posts and picked answers', 'tests/pinned-posts-and-picked-answers.mjs'],
  // A Director opening a member, and recording a guardian's permission. The
  // consent warning existed with nothing that could ever answer it: the
  // columns, the RPCs and the red badge were built and no screen called them.
  ['a director can open somebody', 'tests/a-director-can-open-somebody.mjs'],
  // An invitation creates the account when it is SENT, so a spent link leaves
  // a real account with no password and no way in. Both ways out are checked:
  // the person's, at the moment their sign-in is refused, and the Director's.
  ['nobody is stranded without a password', 'tests/nobody-is-stranded-without-a-password.mjs'],
  // Two people who were unpaired could never be paired again: the unique
  // constraint had no condition and a disconnect archives rather than deletes,
  // so the archived row held the pair's slot forever. The same migration adds
  // the rule nobody had written down, that an Explorer has one Guide.
  ['a pair can be made again', 'tests/a-pair-can-be-made-again.mjs'],
  // The invitation route that never touches an inbox, for the failure an
  // expiry setting cannot fix: a mail scanner spending the one-time link
  // before the person it was sent to ever taps it.
  ['a link can be handed over', 'tests/a-link-can-be-handed-over.mjs'],
  // No Apple menu contains the word Install, and an iPhone, an iPad and a Mac
  // are three different sets of steps rather than one Apple set.
  ['Apple says Add, not Install', 'tests/apple-says-add-not-install.mjs'],
  // Feedback went to the sender's own browser for months, because the sink was
  // never installed and there was no table for it to be stuck in.
  ['feedback reaches the church', 'tests/feedback-reaches-the-church.mjs'],
  ['security audit and Guild activity', 'tests/security-audit-and-guild-activity.mjs'],
  // What may become a clickable link. Linkifying user text is how an app like
  // this grows an XSS hole, so the protocol allowlist and the anti-phishing
  // rules are checked as rules, not as rendered output.
  ['linkify safety', 'tests/linkify.mjs'],
  ['minor badge', 'tests/minor-badge.mjs'],
  ['email templates', 'tests/email-templates.mjs'],
  ['invite emails', 'tests/invite-emails.mjs'],
  // The invite edge function is the only code here that does not reach
  // production through git -- it is deployed by sending its source inline as
  // JSON. A placeholder went live that way once, and the JSON transport
  // silently decodes backslash-u escapes. This forbids the escape; the live
  // comparison is a procedure in the file, because CI has no credentials.
  ['the deployed function is the file', 'tests/the-deployed-function-is-the-file.mjs'],
  ['iPhone install', 'tests/ios-install.mjs'],
  ['plain words', 'tests/plain-words.mjs'],
  ['accounts and sessions', 'tests/accounts-and-sessions.mjs'],
  // A study is written with **bold** headings, *slanted* titles and bare
  // addresses, and every one of those was reaching the screen as literal
  // punctuation or dead text. Fifteen of sixteen studies were affected.
  ['studies are formatted', 'tests/studies-are-formatted.mjs'],
  // Reported from a Xiaomi phone as "I dont see the names when it comes to
  // pairing". The names were all there: forty-one approved Guides, all named,
  // all readable by that Director. The pairing form was simply drawn before
  // they arrived, and a native <select> that is already open never takes new
  // options. A phone on mobile data loses that race every time.
  ['the pairing pickers say what they know', 'tests/the-pairing-pickers-say-what-they-know.mjs'],
  // And the reason those pickers were empty for two real Executive Directors,
  // which was not the screen at all. An executive's authority rests entirely on
  // a row in church_executives; handle_new_user never wrote one, so an
  // executive who was INVITED could read exactly one profile, their own, on
  // every screen. The third time this shape has been fixed, so this one checks
  // the cause rather than the symptom.
  ['an invited executive can see their church', 'tests/an-invited-executive-can-see-their-church.mjs'],
  // The invitation carries a password now, so nobody sees the sign-up form and
  // signup_completed_at is never stamped. Eight people who were using the app
  // were still on the Director's re-send list, and Re-send would have REPLACED
  // the password they were signing in with.
  ['signing in is joining', 'tests/signing-in-is-joining.mjs'],
  // Sharing wrote a row that no screen ever read. "Shared with you" listed
  // everything the caller had permission to read, so an Explorer saw their own
  // resources under a heading saying their Guide sent them, and the same rows
  // again in the shelf directly above. The picker also closed on the first tap,
  // which is why a Guide with several Explorers reported it half working.
  ['sharing a resource goes both ways', 'tests/sharing-a-resource-goes-both-ways.mjs'],
  // The Guide has had the journey all along, as six named stages. The Explorer
  // had nothing, and could be moved forward without ever knowing. This runs the
  // bar they see now and holds the two rules that pull against each other: the
  // width is the position the Guide moved them to, and nothing on the card a
  // person reads is a stage name or a number.
  ['the Explorer sees their journey', 'tests/the-explorer-sees-their-journey.mjs'],
  // A series could never be given the line that appears under its title,
  // because no form ever offered the box -- and renaming one silently erased
  // the line the seeded series already had. Plus the sidebar door that says
  // Resources and holds nothing anybody shared.
  ['a series can say what it is', 'tests/a-series-can-say-what-it-is.mjs'],
  // is_published defaulted to true and no screen ever set it, so every resource
  // anybody added was readable by every Guide and every Director in the church.
  // Private by default now, with the church shelf a deliberate act of
  // leadership's, guarded in the database rather than on a screen.
  ['a resource is personal until it is shared', 'tests/a-resource-is-personal-until-it-is-shared.mjs'],
  // Thirty-seven tables cascade off profiles, so a record meant to outlive an
  // account cannot hold a foreign key to one. That is the check that matters
  // here; the rest keep a name out of it and row level security on.
  ['a record that outlives the people in it', 'tests/a-record-that-outlives-the-people-in-it.mjs'],
  // Sixteen screens loaded live data and subscribed to nothing, including the
  // Explorer's, the Guide's and the Director's, and eighteen tables were never
  // published. Both halves are checked here, because a set that names an
  // unpublished table looks wired and is deaf.
  ['every room keeps up', 'tests/every-room-keeps-up.mjs'],
  ['the diary sits with the conversation', 'tests/the-diary-sits-with-the-conversation.mjs'],
  ['the guild wall keeps up without naming anybody', 'tests/the-guild-wall-keeps-up-without-naming-anybody.mjs'],
  ['a message can be changed or taken back', 'tests/a-message-can-be-changed-or-taken-back.mjs'],
  ['the browser writes only what the app writes', 'tests/the-browser-writes-only-what-the-app-writes.mjs'],
  ['talk is a room of its own', 'tests/talk-is-a-room-of-its-own.mjs'],
  ['the surface has a scale', 'tests/the-surface-has-a-scale.mjs'],
  ['nobody can flood a room', 'tests/nobody-can-flood-a-room.mjs'],
  ['the shelf can be narrowed', 'tests/the-shelf-can-be-narrowed.mjs'],
  ['bulk invite list', 'tests/bulk-invite.mjs'],
  ['stay signed in', 'tests/stay-signed-in.mjs'],
  // Runs the shipped translator over the exact strings that reached a phone:
  // "permission denied for table pairings" and a mime type read out in full.
  // Nothing else here looks at what a failure actually SAYS to a person.
  ['errors are human', 'tests/errors-are-human.mjs'],
  // The two pop-up rules a browser here CANNOT check, because headless
  // Chromium has no collapsing address bar and no home indicator: `vh` versus
  // `dvh`, and the safe area at the bottom of a phone. Both are invisible on a
  // Mac, which is exactly how they shipped.
  ['pop-ups on a phone', 'tests/overlays-on-a-phone.mjs'],
  // Characters that are not emoji have no font promised behind them. The
  // sign-out button was a blank box on every Android phone and perfect on every
  // Apple one, which is why nobody reviewing it ever saw the problem.
  ['icons render everywhere', 'tests/glyphs-render-everywhere.mjs'],
  // Turning what somebody typed into an href is an injection surface, and this
  // field is filled in by a Guide and tapped by the Explorer they walk with.
  ['meeting links', 'tests/meeting-links.mjs'],
  // Whether somebody signing in with things waiting is told, and whether they
  // are buried when they are. Neither is reachable from a browser here: pop-ups
  // need a granted permission, a service worker and a device.
  ['told on arrival', 'tests/notified-on-arrival.mjs'],
  // The most damaging button on a screen must never be the most inviting one.
  ['destructive is discouraged', 'tests/destructive-is-discouraged.mjs'],
  // Whether an Explorer can see that their Guide is a person, and — the half
  // that can bite — whether the query that shows them stays inside the columns
  // the Guide chose to publish.
  ['the Guide is a person', 'tests/the-guide-is-a-person.mjs'],
  // The guild board is the one room where a message reaches a group rather
  // than one person, and some of that group are children. Whether there is a
  // way out of it, and whether it is still not surveilled.
  ['a way out of the guild room', 'tests/a-way-out-of-the-guild-room.mjs'],
  // A room is a folder and a subroom is a folder inside it. Whether every
  // panel in the Office is in exactly one subroom, and whether the links that
  // point into it name subrooms that exist.
  ['rooms and subrooms', 'tests/rooms-and-subrooms.mjs'],
  // Three loading screens existed and the app showed the plainest one. This
  // holds it to the designed one, drawing the real logo.
  ['one loading screen', 'tests/one-loading-screen.mjs'],
  // Who may put something in the library, who reads the record of it
  // afterwards, and who may stop somebody. Each rank watches the rank below it
  // and no further down.
  ['the library is shared and watched', 'tests/the-library-is-shared-and-watched.mjs'],
  // The claims a privacy notice makes have to stay true in the code. Nothing
  // breaks when they drift, which is exactly why they need a check.
  ['data protection', 'tests/data-protection.mjs'],
  // "Send me everything you have about me." The right both laws give, and the
  // one property that keeps answering it safe: it reads as the person asking.
  ['my own data', 'tests/my-own-data.mjs'],
  // A photograph in a conversation is shown rather than named. The sample side
  // had done this correctly for months and the live one had not, which is the
  // parity rule this project keeps writing down and keeps breaking.
  ['a picture looks like a picture', 'tests/a-picture-looks-like-a-picture.mjs'],
  // The documents that get printed and handed to people have to render. A bold
  // phrase that wrapped inside a bullet went out with its asterisks showing.
  ['printed docs render', 'tests/printed-docs-render.mjs'],
  ['themes are readable', 'tests/themes-are-readable.mjs'],
  ['migrations apply cleanly', 'tests/migrations-apply-cleanly.mjs'],
  // The signed-in header, which is the one layout nothing else here can render:
  // it exists only behind a session, and the sandbox these run in cannot reach
  // the backend. It shipped needing ~600px on a 390px phone, which made the
  // whole page scroll sideways — what iOS users saw as an empty strip down the
  // right of every screen.
  ['live header fits a phone', 'tests/live-header-fits.mjs'],
  ['live conversations fit phones and tablets', 'tests/live-conversation-mobile.mjs'],
  ['workflow files', 'tests/workflows.mjs'],
  // Boots `npm run dev` and looks at the page. Everything else in this list
  // tests the PRODUCTION build, which is how a blank `npm run dev` — the very
  // first command the README gives a newcomer — survived with thirty green
  // checks above it.
  ['dev server', 'tests/dev-server.mjs'],
];
for (const [label, file] of staticChecks) {
  if (fs.existsSync(path.join(root, file))) run(label, 'node', [file]);
}

// ------------------------------------------------------------------- e2e ----

if (withE2e) {
  const e2eDir = path.join(root, 'tests/e2e');
  const suites = fs.existsSync(e2eDir)
    ? fs.readdirSync(e2eDir).filter((f) => f.endsWith('.js') && !f.startsWith('_')).sort()
    : [];

  if (suites.length === 0) {
    console.log('\n(no e2e suites found)');
  } else {
    const port = await freePort();
    let expected = '';
    try {
      const info = fs.readFileSync(path.join(root, 'lib/build-info.ts'), 'utf8');
      expected = (/BUILD_ID\s*=\s*"([^"]+)"/.exec(info) || [])[1] || '';
    } catch {
      // A missing build id only costs us the staleness check.
    }

    console.log(`\nStarting the app on port ${port}…`);
    const server = spawn(process.execPath, ['scripts/run-next.mjs', 'start', '-p', String(port)], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    });
    let serverLog = '';
    server.stdout.on('data', (d) => (serverLog += d));
    server.stderr.on('data', (d) => (serverLog += d));

    const stop = () => {
      if (!server.killed) server.kill('SIGKILL');
    };
    process.on('exit', stop);
    process.on('SIGINT', () => {
      stop();
      process.exit(130);
    });

    const ready = await waitForBuild(port, expected);
    if (!ready) {
      stop();
      console.log(serverLog.slice(-2000));
      results.push({ label: 'e2e server', passed: false });
      console.log(
        expected
          ? `\nThe server never answered with build ${expected}. ` +
              'Either it failed to start (log above) or another process holds the port.'
          : '\nThe server never became ready (log above).',
      );
    } else {
      console.log(`Serving build ${expected || '(unknown)'}\n`);
      for (const suite of suites) {
        run(`e2e · ${suite.replace(/\.js$/, '')}`, 'node', [
          `tests/e2e/${suite}`,
          String(port),
        ]);
      }
      stop();
    }
  }
}

// ---------------------------------------------------------------- report ----

const failed = results.filter((r) => !r.passed);
console.log(`\n${'═'.repeat(64)}`);
for (const r of results) {
  console.log(`${r.passed ? 'pass' : 'FAIL'}  ${r.label}`);
}
console.log(
  failed.length === 0
    ? `\nAll ${results.length} checks passed.`
    : `\n${failed.length} of ${results.length} checks FAILED: ${failed
        .map((r) => r.label)
        .join(', ')}`,
);
process.exit(failed.length ? 1 : 0);

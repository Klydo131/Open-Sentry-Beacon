// One command that runs every guard.
//
//   npm run verify        static guards only (no server, no browser)
//   npm run verify:all    the above plus every end-to-end walk
//   --walks-only          build and walk, skipping the static guards (CI runs those once, elsewhere)
//   --shard=2/4           walk only every fourth suite, starting at the second, so CI can split them
//   --quick               the emergency lane: typecheck, build and the safety checks below
//
// The e2e half owns the server: it picks a free port, waits for the build id it
// just built (a stale server would answer with old code), and always tears down.

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');
const walksOnly = process.argv.includes('--walks-only');
const withE2e = process.argv.includes('--all') || walksOnly;
const shardArg = (process.argv.find((a) => a.startsWith('--shard=')) || '').slice('--shard='.length);
const [shardIndex, shardCount] = shardArg ? shardArg.split('/').map(Number) : [1, 1];
if (!(shardCount >= 1 && shardIndex >= 1 && shardIndex <= shardCount)) {
  console.error(`--shard must look like 2/4, not "${shardArg}"`);
  process.exit(2);
}

// What an emergency fix must still pass. Everything here is about not leaking
// data or access; layout and wording wait for the full run on main.
const QUICK = new Set([
  'tests/no-secrets.js',
  'tests/no-backend.js',
  'tests/backend-csp.mjs',
  'tests/security-invariants.mjs',
  'tests/nobody-promotes-themselves.mjs',
  'tests/an-ended-session-ends-at-once.mjs',
  'tests/signing-out-ends-the-session.mjs',
  'tests/data-protection.mjs',
]);
const results = [];

// On Windows, npm and npx are .cmd shims that Node will only run through a
// shell. Every argument passed here is a bare word, so the shell cannot mis-split it.
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

/**
 * Like `run`, for jobs that run alongside others. Output is captured and
 * printed as one block per job, so parallel output stays readable.
 */
function runAside(label, cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (code) => {
      process.stdout.write(`\n─── ${label} ${'─'.repeat(Math.max(0, 56 - label.length))}\n`);
      process.stdout.write(output);
      resolve({ label, passed: code === 0 });
    });
  });
}

/**
 * Run jobs a few at a time. Each is a whole browser, bounded by memory, not
 * CPU; E2E_WORKERS overrides the default (1 helps when bisecting).
 */
async function inParallel(jobs, workers) {
  const out = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const mine = next++;
      if (mine >= jobs.length) return;
      out[mine] = await jobs[mine]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, worker));
  return out;
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
        // A server answering with a different build id is stale; do not test against it.
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

if (!walksOnly) run('typecheck', 'npx', ['tsc', '--noEmit']);
run('build', 'npm', ['run', 'build']);

const staticChecks = [
  ['no secrets', 'tests/no-secrets.js'],
  ['no backend, no pipelines', 'tests/no-backend.js'],
  ['test portability', 'tests/test-portability.mjs'],
  ['brand consistency', 'tests/brand-consistency.mjs'],
  ['the brand is one name', 'tests/the-brand-is-one-name.mjs'],
  ['media guardrails', 'tests/media-guardrails.js'],
  ['backend CSP', 'tests/backend-csp.mjs'],
  ['real-time and pairing media', 'tests/realtime-and-media.mjs'],
  ['update floor', 'tests/min-build.mjs'],
  ['auto-update policy', 'tests/auto-update-policy.mjs'],
  ['a first install stays on the page', 'tests/a-first-install-stays-on-the-page.mjs'],
  ['analytics over time', 'tests/analytics-trend.mjs'],
  ['security invariants', 'tests/security-invariants.mjs'],
  ['the signed-out role', 'tests/the-signed-out-role.mjs'],
  ['the Explorer starts with Jesus', 'tests/the-explorer-starts-with-jesus.mjs'],
  ['dead is not refused', 'tests/dead-is-not-refused.mjs'],
  ['notifications go through the worker', 'tests/notifications-go-through-the-worker.mjs'],
  ['Beacon has its own sound', 'tests/beacon-has-its-own-sound.mjs'],
  ['no export nothing uses', 'scripts/unused-exports.mjs'],
  ['a study can be corrected', 'tests/a-study-can-be-corrected.mjs'],
  ['the screen keeps up', 'tests/the-screen-keeps-up.mjs'],
  ['a resource can be taken off the shelf', 'tests/a-resource-can-be-taken-off-the-shelf.mjs'],
  ['the docs know what shipped', 'tests/the-docs-know-what-shipped.mjs'],
  ['the ambience is pleasant', 'tests/the-ambience-is-pleasant.mjs'],
  ['the named Guide is paired', 'tests/the-named-guide-is-paired.mjs'],
  ['a first password', 'tests/a-first-password.mjs'],
  ['the invitation carries a password', 'tests/the-invitation-carries-a-password.mjs'],
  ['the studies are sourced', 'tests/the-studies-are-sourced.mjs'],
  ['the library is easy to use', 'tests/the-library-is-easy-to-use.mjs'],
  ['a share can say why', 'tests/a-share-can-say-why.mjs'],
  ['a Guide sees who already has it', 'tests/a-guide-sees-who-already-has-it.mjs'],
  ['the chat is a bubble everywhere', 'tests/the-chat-is-a-bubble-everywhere.mjs'],
  ['the thread reads like a conversation', 'tests/the-thread-reads-like-a-conversation.mjs'],
  ['the live app offers what the tutorial offers', 'tests/the-live-app-offers-what-the-tutorial-offers.mjs'],
  ['emoji are suggested as you type', 'tests/emoji-are-suggested-as-you-type.mjs'],
  ['the chat is the bubble and it moves', 'tests/the-chat-is-the-bubble-and-it-moves.mjs'],
  ['an appointment is remembered', 'tests/an-appointment-is-remembered.mjs'],
  ['you can tell whether it was read', 'tests/you-can-tell-whether-it-was-read.mjs'],
  ['a pairing has a track record', 'tests/a-pairing-has-a-track-record.mjs'],
  ['the pocket keeps a web app safely', 'tests/the-pocket-keeps-a-web-app-safely.mjs'],
  ['the rail is not the only way to reach something', 'tests/the-rail-is-not-the-only-way-to-reach-something.mjs'],
  ['a report is reachable by whoever is in it', 'tests/a-report-is-reachable-by-whoever-is-in-it.mjs'],
  ['a report is one conversation', 'tests/a-report-is-one-conversation.mjs'],
  ['an animation that loops does not repaint', 'tests/an-animation-that-loops-does-not-repaint.mjs'],
  ['an explorer is told what to do next', 'tests/an-explorer-is-told-what-to-do-next.mjs'],
  ['the pocket is for tools', 'tests/the-pocket-is-for-tools.mjs'],
  ['a guide is told why sharing is paused', 'tests/a-guide-is-told-why-sharing-is-paused.mjs'],
  ['the room belongs to its owner at any width', 'tests/the-room-belongs-to-its-owner-at-any-width.mjs'],
  ['a study room the church owns', 'tests/a-study-room-the-church-owns.mjs'],
  ['the study room is paid for on arrival', 'tests/the-study-room-is-paid-for-on-arrival.mjs'],
  ['a room that already exists still opens', 'tests/a-room-that-already-exists-still-opens.mjs'],
  ['a page can be tagged and dated', 'tests/a-page-can-be-tagged-and-dated.mjs'],
  ['leadership sees the shape, not the thing', 'tests/leadership-sees-the-shape-not-the-thing.mjs'],
  ['a guide is given once', 'tests/a-guide-is-given-once.mjs'],
  ['a picker says why it is empty', 'tests/a-picker-says-why-it-is-empty.mjs'],
  ['leadership can measure without reading', 'tests/leadership-can-measure-without-reading.mjs'],
  ['the comment stripper keeps the code', 'tests/the-comment-stripper-keeps-the-code.mjs'],
  ['the shelf knows what it is holding', 'tests/the-shelf-knows-what-it-is-holding.mjs'],
  ['an Explorer reads the studies', 'tests/an-explorer-reads-the-studies.mjs'],
  ['the reading is recorded', 'tests/the-reading-is-recorded.mjs'],
  ['the ship reads git correctly', 'tests/the-ship-reads-git-correctly.mjs'],
  ['a report can carry evidence', 'tests/a-report-can-carry-evidence.mjs'],
  ['the sign-up can be shown', 'tests/the-sign-up-can-be-shown.mjs'],
  ['pinned posts and picked answers', 'tests/pinned-posts-and-picked-answers.mjs'],
  ['a director can open somebody', 'tests/a-director-can-open-somebody.mjs'],
  ['nobody is stranded without a password', 'tests/nobody-is-stranded-without-a-password.mjs'],
  ['a pair can be made again', 'tests/a-pair-can-be-made-again.mjs'],
  ['a link can be handed over', 'tests/a-link-can-be-handed-over.mjs'],
  ['Apple says Add, not Install', 'tests/apple-says-add-not-install.mjs'],
  ['feedback reaches the church', 'tests/feedback-reaches-the-church.mjs'],
  ['security audit and Guild activity', 'tests/security-audit-and-guild-activity.mjs'],
  ['linkify safety', 'tests/linkify.mjs'],
  ['minor badge', 'tests/minor-badge.mjs'],
  ['email templates', 'tests/email-templates.mjs'],
  ['invite emails', 'tests/invite-emails.mjs'],
  ['the deployed function is the file', 'tests/the-deployed-function-is-the-file.mjs'],
  ['iPhone install', 'tests/ios-install.mjs'],
  ['plain words', 'tests/plain-words.mjs'],
  ['accounts and sessions', 'tests/accounts-and-sessions.mjs'],
  ['studies are formatted', 'tests/studies-are-formatted.mjs'],
  ['the pairing pickers say what they know', 'tests/the-pairing-pickers-say-what-they-know.mjs'],
  ['an invited executive can see their church', 'tests/an-invited-executive-can-see-their-church.mjs'],
  ['signing in is joining', 'tests/signing-in-is-joining.mjs'],
  ['sharing a resource goes both ways', 'tests/sharing-a-resource-goes-both-ways.mjs'],
  ['the Explorer sees their journey', 'tests/the-explorer-sees-their-journey.mjs'],
  ['a series can say what it is', 'tests/a-series-can-say-what-it-is.mjs'],
  ['a resource is personal until it is shared', 'tests/a-resource-is-personal-until-it-is-shared.mjs'],
  ['a record that outlives the people in it', 'tests/a-record-that-outlives-the-people-in-it.mjs'],
  ['every room keeps up', 'tests/every-room-keeps-up.mjs'],
  ['the tutorial still points at something', 'tests/the-tutorial-still-points-at-something.mjs'],
  ['a person waiting is visible to somebody', 'tests/a-person-waiting-is-visible-to-somebody.mjs'],
  ['re-send cannot rebuild a removed account', 'tests/re-send-cannot-rebuild-a-removed-account.mjs'],
  ['a button cannot hide its own label', 'tests/a-button-cannot-hide-its-own-label.mjs'],
  ['invite them actually invites them', 'tests/invite-them-actually-invites.mjs'],
  ['leadership the head appoints does not queue', 'tests/leadership-the-head-appoints-does-not-queue.mjs'],
  ['a private copy is never published', 'tests/a-private-copy-is-never-published.mjs'],
  ['an appointment offers what you used before', 'tests/an-appointment-offers-what-you-used-before.mjs'],
  ['a note read once can be put away', 'tests/a-note-read-once-can-be-put-away.mjs'],
  ['appointments first, the chat in the bubble', 'tests/appointments-first-the-chat-in-the-bubble.mjs'],
  ['sub-rooms are a drop-down', 'tests/sub-rooms-are-a-drop-down.mjs'],
  ['the desk is a drawer', 'tests/the-desk-is-a-drawer.mjs'],
  ['explorer profiles can be seen', 'tests/explorer-profiles-can-be-seen.mjs'],
  ['every animation can be stilled', 'tests/every-animation-can-be-stilled.mjs'],
  ['fixed advisories stay fixed', 'tests/fixed-advisories-stay-fixed.mjs'],
  ['the deploy guide matches the app', 'tests/the-deploy-guide-matches-the-app.mjs'],
  ['a conversation can reply, react and speak', 'tests/a-conversation-can-reply-react-and-speak.mjs'],
  ['a stored path cannot leave its folder', 'tests/a-stored-path-cannot-leave-its-folder.mjs'],
  ['the chat works before its database update', 'tests/the-chat-works-before-its-database-update.mjs'],
  ['no hidden characters in the code', 'tests/no-hidden-characters.mjs'],
  ['every dependency is under a licence we can ship', 'tests/dependency-licences.mjs'],
  ['the research agents only read', 'tests/the-research-agents-only-read.mjs'],
  ['the guild wall keeps up without naming anybody', 'tests/the-guild-wall-keeps-up-without-naming-anybody.mjs'],
  ['a message can be changed or taken back', 'tests/a-message-can-be-changed-or-taken-back.mjs'],
  ['the browser writes only what the app writes', 'tests/the-browser-writes-only-what-the-app-writes.mjs'],
  ['talk is a room of its own', 'tests/talk-is-a-room-of-its-own.mjs'],
  ['the surface has a scale', 'tests/the-surface-has-a-scale.mjs'],
  ['nobody can flood a room', 'tests/nobody-can-flood-a-room.mjs'],
  ['the shelf can be narrowed', 'tests/the-shelf-can-be-narrowed.mjs'],
  ['bulk invite list', 'tests/bulk-invite.mjs'],
  ['stay signed in', 'tests/stay-signed-in.mjs'],
  ['errors are human', 'tests/errors-are-human.mjs'],
  ['pop-ups on a phone', 'tests/overlays-on-a-phone.mjs'],
  ['icons render everywhere', 'tests/glyphs-render-everywhere.mjs'],
  ['meeting links', 'tests/meeting-links.mjs'],
  ['told on arrival', 'tests/notified-on-arrival.mjs'],
  ['destructive is discouraged', 'tests/destructive-is-discouraged.mjs'],
  ['the Guide is a person', 'tests/the-guide-is-a-person.mjs'],
  ['a way out of the guild room', 'tests/a-way-out-of-the-guild-room.mjs'],
  ['the guild room is archived, not deleted', 'tests/the-guild-room-is-archived-not-deleted.mjs'],
  ['rooms and subrooms', 'tests/rooms-and-subrooms.mjs'],
  ['one loading screen', 'tests/one-loading-screen.mjs'],
  ['the library is shared and watched', 'tests/the-library-is-shared-and-watched.mjs'],
  ['data protection', 'tests/data-protection.mjs'],
  ['my own data', 'tests/my-own-data.mjs'],
  ['a picture looks like a picture', 'tests/a-picture-looks-like-a-picture.mjs'],
  ['printed docs render', 'tests/printed-docs-render.mjs'],
  ['themes are readable', 'tests/themes-are-readable.mjs'],
  ['migrations apply cleanly', 'tests/migrations-apply-cleanly.mjs'],
  ['live header fits a phone', 'tests/live-header-fits.mjs'],
  ['live conversations fit phones and tablets', 'tests/live-conversation-mobile.mjs'],
  ['the presentation screens are connected', 'tests/presentation-feature-ui.mjs'],
  ['workflow files', 'tests/workflows.mjs'],
  ['the lockfile can install', 'tests/the-lockfile-can-install.mjs'],
  ['a room can become a vault', 'tests/a-room-can-become-a-vault.mjs'],
  ['a Sabbath program is a Word file', 'tests/a-sabbath-program-is-a-word-file.mjs'],
  ['evangelistic meetings are yours to shape', 'tests/evangelistic-meetings-are-yours-to-shape.mjs'],
  ['a progress report counts what happened', 'tests/a-progress-report-counts-what-happened.mjs'],
  ['the Office follows you: devices, folders, calendars', 'tests/the-office-follows-you.mjs'],
  ['the Classic look stays as it is', 'tests/the-classic-look-stays.mjs'],
  ['a suspension is immediate', 'tests/a-suspension-is-immediate.mjs'],
  ['a door compares the right things', 'tests/a-door-compares-the-right-things.mjs'],
  ['prayer runs both ways', 'tests/prayer-runs-both-ways.mjs'],
  ['a church can install it either way', 'tests/a-church-can-install-it-either-way.mjs'],
  ['resources and studies stay simple', 'tests/resources-and-studies-stay-simple.mjs'],
  ['a resource can be a file', 'tests/a-resource-can-be-a-file.mjs'],
  ['photos lose their location', 'tests/photos-lose-their-location.mjs'],
  ['what one person can upload', 'tests/what-one-person-can-upload.mjs'],
  ['nobody promotes themselves', 'tests/nobody-promotes-themselves.mjs'],
  ['place search', 'tests/place-search.mjs'],
  ['a folder does not say whose church', 'tests/a-folder-does-not-say-whose-church.mjs'],
  ['the tutorial ring keeps up', 'tests/the-tutorial-ring-keeps-up.mjs'],
  ['a study takes files anywhere', 'tests/a-study-takes-files-anywhere.mjs'],
  ['a study can have a drawing', 'tests/a-study-can-have-a-drawing.mjs'],
  ['an invitation password runs out', 'tests/an-invitation-password-runs-out.mjs'],
  ['an ended session ends at once', 'tests/an-ended-session-ends-at-once.mjs'],
  ['the toolkit is opt-in', 'tests/the-toolkit-is-opt-in.mjs'],
  ['the bottom bar', 'tests/the-bottom-bar.mjs'],
  ['text size is tried first', 'tests/text-size-is-tried-first.mjs'],
  ['offline says offline', 'tests/offline-says-offline.mjs'],
  ['blog and announcements are home', 'tests/blog-and-announcements-are-home.mjs'],
  ['signing out ends the session', 'tests/signing-out-ends-the-session.mjs'],
  ['room colours keep the look\'s light', 'tests/room-colours-keep-the-look-light.mjs'],
  ['text and ground change together', 'tests/text-and-ground-change-together.mjs'],
  ['the walks say what they saw', 'tests/the-walks-say-what-they-saw.mjs'],
  ['a walk forgives only what it cut short', 'tests/a-walk-forgives-only-what-it-cut-short.mjs'],
  ['screens open without a hitch', 'tests/screens-open-without-a-hitch.mjs'],
  ['the music room', 'tests/the-music-room.mjs'],
  ['the app works with no signal', 'tests/the-app-works-with-no-signal.mjs'],
  ['the owner sees it first', 'tests/the-owner-sees-it-first.mjs'],
  ['the Postgres edition installs', 'tests/the-postgres-edition-installs.mjs'],
  ['a study room keeps its promises', 'tests/a-study-room-keeps-its-promises.mjs'],
  ['a hub is kept running by gifts', 'tests/a-hub-is-kept-running-by-gifts.mjs'],
  ['trends are counts only', 'tests/trends-are-counts-only.mjs'],
  ['every table says who may reach it', 'tests/every-table-says-who-may-reach-it.mjs'],
  ['the October 2026 patches hold', 'tests/the-october-2026-patches-hold.mjs'],
  ['a new password has its own page', 'tests/a-new-password-has-its-own-page.mjs'],
  ['the security layers hold', 'tests/the-security-layers-hold.mjs'],
  ['dev server', 'tests/dev-server.mjs'],
];
// The emergency lane names its checks by file; one that is not registered here fails it.
for (const file of quick ? QUICK : []) {
  if (!staticChecks.some(([, f]) => f === file)) {
    console.log(`MISSING ${file} is in the quick lane and is not a registered check.`);
    results.push({ label: `quick lane: ${file}`, passed: false });
  }
}

// A registered check whose file is missing fails the gate instead of being skipped.
for (const [label, file] of walksOnly ? [] : staticChecks) {
  if (quick && !QUICK.has(file)) continue;
  if (fs.existsSync(path.join(root, file))) {
    run(label, 'node', [file]);
  } else {
    process.stdout.write(`\n─── ${label} ${'─'.repeat(Math.max(0, 56 - label.length))}\n`);
    console.log(`MISSING ${file} is registered in this gate and is not on disk.`);
    results.push({ label: `${label} (file missing)`, passed: false });
  }
}

// ------------------------------------------------------------------- e2e ----

if (withE2e) {
  const e2eDir = path.join(root, 'tests/e2e');
  // Dealt round-robin rather than cut into runs, so the long suites spread out.
  const suites = (fs.existsSync(e2eDir)
    ? fs.readdirSync(e2eDir).filter((f) => f.endsWith('.js') && !f.startsWith('_')).sort()
    : []
  ).filter((_, i) => i % shardCount === shardIndex - 1);

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

    // SIGTERM, which scripts/run-next.mjs passes on to Next.js. SIGKILL ended
    // only the wrapper and left the server itself running after every walk.
    const stop = () => {
      if (!server.killed) server.kill('SIGTERM');
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
      // Walks run four at a time; each launches its own browser profile, so they
      // do not share state.
      const workers = Math.max(1, Number(process.env.E2E_WORKERS) || 4);
      console.log(`Serving build ${expected || '(unknown)'} — ${suites.length} walks, ${workers} at a time\n`);
      const done = await inParallel(
        suites.map((suite) => () => runAside(
          `e2e · ${suite.replace(/\.js$/, '')}`,
          'node',
          [`tests/e2e/${suite}`, String(port)],
        )),
        workers,
      );
      for (const r of done) results.push(r);
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

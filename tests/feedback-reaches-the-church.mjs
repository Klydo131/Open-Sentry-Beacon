// Feedback goes somewhere a person will read it.
//
// THE REPORT: "Feedback is not working, I am pretty sure some feedbacks are
// still stuck in the database since I haven't received any email feedbacks."
//
// Nothing was stuck, and the truth was worse. There was no feedback table, and
// `setFeedbackSink` was never called ANYWHERE in the app -- so every message
// went to the default sink in lib/backend/feedback.ts, which honestly saves to
// the sender's own browser and says so on screen. Every message people wrote is
// in `hope-beacon.feedback.local` on the phone that wrote it and has never
// crossed the network. None of it can be recovered centrally, because it was
// never centrally anywhere.
//
// The default is right for the open-source build: a church cloning this has no
// server on the first run, and a demo that silently drops feedback teaches
// everybody that feedback is pointless. What was missing was the other half.
//
// This checks the half that was missing, and that the half that was right is
// still there.
//
//   node tests/feedback-reaches-the-church.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const stripComments = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// ---- 1. A real sink is actually installed --------------------------------
//
// This is the whole bug. Everything else was already written and correct.
const session = stripComments(read('lib/live/session.tsx'));
ok(/setFeedbackSink\(churchFeedbackSink\)/.test(session),
   'the app points feedback at the church, which nothing did before');
ok(/flushKeptFeedback\(\)/.test(session),
   'and sends whatever this device kept while there was nowhere to send it');

// ---- 2. The sink never loses a message -----------------------------------
//
// Rule one of a sink, stated in lib/backend/feedback.ts: a message somebody
// took the trouble to write must not be lost because a network was down.
const sink = read('lib/live/feedback-sink.ts');
const code = stripComments(sink);
ok(/localFeedbackSink\.send\(message\)/.test(code),
   'it falls back to the device rather than failing');
ok((code.match(/localFeedbackSink\.send\(message\)/g) || []).length >= 4,
   'on every way out: no client, no session, no church, and a thrown error');
ok(/catch/.test(code) && !/throw /.test(code),
   'and never throws, whatever the network did');
ok(/error\.code !== '23505'/.test(code),
   'the same message arriving twice counts as delivered, not as a failure');
// `supabase()` returns null off the live build; `db()` throws. Using the
// throwing one here would make feedback the thing that breaks the app.
ok(/supabase\(\)/.test(code) && !/\bdb\(\)/.test(code),
   'it asks for the client that returns null rather than the one that throws');

// ---- 3. The table, and who may do what -----------------------------------
const mig = read('supabase/migrations/20260904100000_feedback_reaches_the_church.sql');
ok(/create table if not exists public\.feedback/.test(mig), 'there is somewhere for it to go');
ok(/alter table public\.feedback enable row level security/.test(mig), 'with row level security on');
ok(/church_id = public\.my_church_id\(\)/.test(mig), 'anybody in the church may send one');
// Nullable, with no NOT NULL on it: somebody reporting that a screen is
// confusing should not have to put their name to it.
ok(/author_id\s+uuid references public\.profiles[^,]*,/.test(mig)
   && !/author_id\s+uuid[^,]*not null/i.test(mig),
   'and may send it without attaching themselves');
ok(/create unique index if not exists feedback_one_per_client_id/.test(mig),
   'a retry from a phone that lost signal cannot file the same message twice');

// NO DELETE, deliberately. Feedback a leader can quietly remove is feedback
// nobody can rely on having been heard.
ok(!/for delete/.test(mig), 'and nobody can delete feedback, only mark it dealt with');

// Reading it. Probed against the live policies and rolled back:
//   send=ALLOWED | duplicate=refused | author_sees_own=1
//   another_member_sees=0 | leader_sees=1 | leader_handles=ALLOWED
//   leader_deletes=refused
const mig2 = read('supabase/migrations/20260904100100_feedback_you_can_see_your_own.sql');
ok(/manages_church\(church_id\)/.test(mig2), 'leadership reads all of it');
ok(/author_id = \(select auth\.uid\(\)\)/.test(mig2), 'and you can read your own back');

// ---- 4. Somewhere to read it ---------------------------------------------
//
// A table nobody opens is the same complaint one level down.
const inbox = read('components/LiveFeedbackInbox.tsx');
const admin = read('components/live/AdminPage.tsx');
ok(/room === 'feedback'/.test(admin) && /LiveFeedbackInbox/.test(admin),
   'it has a room of its own on the Admin screen');
ok(/id: 'feedback'/.test(admin), 'and a way to reach that room');
// Since 28 October 2026 the inbox is the shared review screen
// (components/FeedbackReviewInbox.tsx): written up, handed on, then closed
// (docs/FEEDBACK.md). The same two promises, read from where they now live.
const screen = read('components/FeedbackReviewInbox.tsx');
const order = ['Waiting on you', 'Being looked at', 'Done'].map((title) => screen.indexOf(`['${title}', `));
ok(/const waiting = items\.filter\(\(i\) => i\.status === 'new'\);/.test(screen)
   && order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])),
   'unanswered feedback is listed before what has been dealt with');
ok(/<FeedbackReviewInbox/.test(inbox) && /live\.setFeedbackStatus\(id, status, extra\)/.test(inbox)
   && /actions\.setStatus\(item\.id, 'done'/.test(screen),
   'and can be marked dealt with');

// ---- 5. The open-source default is untouched -----------------------------
//
// A church cloning this still gets a working app with no server, and is still
// told honestly where its feedback went.
const base = read('lib/backend/feedback.ts');
ok(/saved on this device only, no server is configured/.test(base),
   'the default sink still says plainly that nothing left the device');
ok(/let sink: FeedbackSink = localFeedbackSink;/.test(base),
   'and is still what a fresh clone uses');

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);

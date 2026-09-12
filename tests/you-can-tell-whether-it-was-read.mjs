// You can tell whether the last thing you said has been read.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. `read_at` has been written since this app had messages:
// opening a thread marks the OTHER person's messages read, all three screens
// that show a conversation call it, and it arrives in the browser on every
// load. Nothing ever drew it. The only thing it fed was the unread count on the
// bubble, so a Guide could see THAT something was waiting for them and never
// whether anything they sent had landed.
//
// THE RULE THIS CHANGED, AND IT CHANGED BY DECISION RATHER THAN BY DRIFT.
// TalkDock said "no read receipts beyond the one this app already had". It was
// raised as a decision rather than built, with the concern stated plainly: a
// receipt puts pressure on the person who has not replied, and an Explorer
// bringing something hard to their Guide is the person least able to carry it.
// The owner asked for it anyway, knowing that. The comment in TalkDock is
// amended rather than deleted, so the reasoning survives the person.
//
// WHAT MAKES IT DEFENSIBLE, IN THIS CHURCH, MEASURED: forty-two Explorers have
// not opened the app in a week. A Guide writing into that silence could not
// tell "they read it and had nothing to say" from "they have not been back
// since August" -- and those call for completely different responses, one
// patient and one a telephone call.
//
// THE SHAPE IS WHAT KEEPS THE CONCERN IN VIEW, so the shape is what is checked:
// one receipt, under the last thing YOU sent, never a column of `Seen` down
// everything you have ever written, and never on the other person's messages.
//
//   node tests/you-can-tell-whether-it-was-read.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
/** Comments blanked AND whitespace collapsed. Six checks in this project have
 *  passed on prose; blanking alone preserves length and breaks distance. */
const strip = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ')
  .replace(/\s+/g, ' ');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const src   = read('components/live/shared.tsx');
const code  = strip(src);
const data  = strip(read('lib/live/data.ts'));
const dock  = read('components/live/TalkDock.tsx');
/** The dock's PROSE, as prose: comment markers removed and wrapping undone.
 *  This section is deliberately about the comment rather than the code, so it
 *  cannot strip comments -- but a sentence written across two `//` lines is
 *  still one sentence, and matching the raw text would make every check here
 *  depend on where the line happened to wrap. */
const dockProse = dock.replace(/^\s*\/\/ ?/gm, '').replace(/\s+/g, ' ');

// ---------------------------------------------------------------------------
// 1. THE DATA WAS ALREADY THERE, AND STILL IS
// ---------------------------------------------------------------------------
{
  ok(/neq\('sender_id', me\) \.is\('read_at', null\)/.test(data)
     || /\.neq\('sender_id', me\)/.test(data),
     "marking read touches the other person's messages, never your own");
  ok(/read_at\?: string/.test(read('lib/types.ts')),
     'and it reaches the browser on the message');
}

// ---------------------------------------------------------------------------
// 2. ONE RECEIPT, ON THE LAST THING YOU SENT
// ---------------------------------------------------------------------------
//
// THE SHAPE IS THE SAFEGUARD. A `Seen` under every message you have ever
// written is the version of this feature people dislike, and it is one edit
// away at all times -- so the edit is what this section catches.
{
  ok(/const lastMine = \(\(\) => \{/.test(code),
     'the thread finds the most recent message you sent');

  ok(/entry\.id === lastMine\.id/.test(code),
     'and the receipt is drawn only against that one');

  // NOT PER RUN, NOT PER MESSAGE. `endsRun` is right beside this in the source
  // and is the obvious thing to reach for by mistake.
  const receipt = code.slice(code.indexOf('lastMine &&'));
  ok(!/endsRun &&[\s\S]{0,80}read_at/.test(receipt),
     'not one per run, which would be a column of Seen down the whole thread');

  // YOUR OWN ONLY. A receipt on THEIR message announces that you read it, which
  // is the same fact from the other side and is not yours to publish.
  ok(/e\.who === myId/.test(code),
     'and only your own messages carry one');
}

// ---------------------------------------------------------------------------
// 3. `SENT` IS THE HALF THAT DOES THE WORK
// ---------------------------------------------------------------------------
//
// A receipt that only appears once something has been read tells you nothing on
// the days it matters. The useful sentence is the one on a message from four
// days ago that still says Sent.
{
  ok(/'Sent'/.test(code),
     'a message that has not been read says so');
  ok(/read_at \? `Seen/.test(code) || /`Seen \$\{/.test(code),
     'and one that has says when');
}

// ---------------------------------------------------------------------------
// 4. A MESSAGE TAKEN BACK REPORTS NOTHING
// ---------------------------------------------------------------------------
//
// "Seen" under a message whose words have been removed is the app telling
// somebody their deletion was witnessed, which is the opposite of what taking
// something back is for.
{
  ok(/!e\.message\.deleted_at/.test(code),
     'a message you took back does not carry a receipt');
}

// ---------------------------------------------------------------------------
// 5. THE RULE WAS AMENDED, NOT QUIETLY DROPPED
// ---------------------------------------------------------------------------
//
// THE PART THAT OUTLIVES EVERYBODY. TalkDock stated a product rule against read
// receipts. Deleting that sentence and shipping the feature would leave no
// trace that the question was ever asked, and the next person would reopen it
// from nothing. The reasoning has to survive the decision.
{
  ok(/THIS RULE CHANGED/.test(dockProse),
     'TalkDock records that its own rule about receipts was changed');
  ok(/owner/i.test(dockProse) && /pressure/i.test(dockProse),
     'and records who decided it and what the objection was');
  ok(/no presence, no typing indicator/.test(dockProse),
     'while the rest of the rule against presence features still stands');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);

// The chat is a place you can go, and it took its safeguards with it.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. Reported: the chat should not be a card people scroll a page
// to reach — "most users want always the present chat that doesn't need to
// scroll down for other features, specially for Explorers", and for Guides it
// is "their main connection to the Explorers".
//
// THE RISK IN MOVING A CONVERSATION. This app has one rule about the Explorer's
// conversation that outranks the layout: the way OUT of a relationship lives on
// the same screen as the relationship. components/live/ExplorerPage.tsx says so
// in the source — "must not be moved to another one". Giving the conversation
// its own room is exactly the change that could leave that control behind on
// the old page, and nothing would error: the new room would simply be a chat
// with no way to report the person in it.
//
//   node tests/talk-is-a-room-of-its-own.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// ---------------------------------------------------------------------------
// 1. IT IS A ROOM, NOT ONLY A PANEL
// ---------------------------------------------------------------------------
{
  ok(exists('app/talk/page.tsx'), 'the chat has a route of its own at /talk');
  const page = read('app/talk/page.tsx');

  // A ROUTE IS WHAT MAKES BACK, RELOAD AND A NOTIFICATION LINK WORK. A panel
  // held only in memory has none of those and is the version people get lost in.
  ok(/allow=\{\['ds', 'dm'\]\}/.test(page),
     'and only the two roles who have a conversation may open it');
  ok(/onExit/.test(page) && /router\.back\(\)/.test(page),
     'it has a way out, and the way out is back to where you came from');
  ok(/Suspense/.test(page),
     'the search param is behind a boundary, so the route still builds');
}

// ---------------------------------------------------------------------------
// 2. THE SAFEGUARD TRAVELLED WITH IT
// ---------------------------------------------------------------------------
//
// The whole point of this file.
{
  const surface = read('components/live/TalkSurface.tsx');
  ok(/<LiveReportForm/.test(surface) && /onReport=\{current \?/.test(surface),
     'the report is in the chat room, in its header, not left behind on the old page');
  ok(/subjectId=\{current\.other_id\}/.test(surface),
     'and it reports the person you are actually talking to');

  // HOME GAVE ITS CONVERSATION TO THE BUBBLE on 30 September 2026, and the
  // report went with it rather than staying behind beside nothing. A report
  // link on a page with no conversation on it would be a way out of a room
  // that is not there.
  const explorer = read('components/live/ExplorerPage.tsx');
  ok(!/<Conversation/.test(explorer) && !/<LiveReportControl/.test(explorer),
     'and the Explorer page keeps neither the thread nor a report link without one');
}

// ---------------------------------------------------------------------------
// 3. THE COUNT CAN BE TRUSTED
// ---------------------------------------------------------------------------
//
// A badge that lies once is a badge nobody believes again.
{
  const surface = read('components/live/TalkSurface.tsx');
  ok(/markRead\(/.test(surface),
     'opening a conversation marks it read, so the count falls when it should');

  const data = read('lib/live/data.ts');
  ok(/rpc\('my_threads'\)/.test(data),
     'the count comes from the database in one call');
  ok(!/listMessages\([\s\S]{0,80}\)[\s\S]{0,200}filter\(\(m\)[\s\S]{0,80}read_at/.test(data),
     'and not by downloading every message to count them in the browser');

  const migration = fs.readdirSync(path.join(root, 'supabase/migrations'))
    .find((f) => f.includes('talk_is_a_room'));
  ok(Boolean(migration), 'my_threads is created by a migration');
  if (migration) {
    const sql = read(`supabase/migrations/${migration}`);
    // ONLY THE CALLER'S OWN PAIRINGS. This function runs as its owner, so the
    // where-clause is the only thing standing there.
    ok(/p\.dm_id = me or p\.ds_id = me/.test(sql),
       'and it returns only pairings the caller is actually in');
    ok(/security definer/i.test(sql) && /stable/i.test(sql),
       'it is a definer function and does not pretend to write');
  }
}

// ---------------------------------------------------------------------------
// 4. THE DOCK KNOWS WHERE IT IS NOT WANTED
// ---------------------------------------------------------------------------
{
  const dock = read('components/live/TalkDock.tsx');
  // Comments blanked. This section had a check that passed on PROSE -- see
  // immediately below -- and the repair is the same one this project has now
  // made four times: measure the code, not the essay.
  const dockCode = dock.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
                                (m) => ' '.repeat(m.length));

  // THIS CHECK USED TO ASSERT `hidden xl:block`, AND IT WAS STILL GREEN AFTER
  // THAT CLASS WAS DELETED.
  //
  // It read the raw file, and the commit that removed the fence left a comment
  // explaining what `hidden xl:block` had been and why it went. So the check
  // matched its own obituary. For two chunks it asserted that the panel was
  // hidden below xl while the app did the exact opposite, and it contradicted
  // tests/the-chat-is-a-bubble-everywhere.mjs -- which tests the same file with
  // the comments stripped -- without either one going red.
  //
  // The original reasoning was sound and is preserved there: a SMALL floating
  // panel on a small screen covers the thing it floats over. What changed is
  // that the panel is not small on a phone. It is a bubble when closed and the
  // whole screen when opened, so the objection no longer applies.
  ok(!/hidden xl:block/.test(dockCode),
     'the bubble is not fenced to wide screens; a phone gets it too');
  ok(/role !== 'ds' && profile\.role !== 'dm'/.test(dock),
     'it draws nothing for a Director, who has no conversation to be in');
  ok(/path === '\/talk'/.test(dock),
     'and nothing on the chat page itself, which would be a second copy of it');

  // NOTIFICATIONS: only on a rise, and never for the thread on screen.
  ok(/if \(before === null\) return now;/.test(dock),
     'the first look sets a baseline rather than announcing what was already there');
  ok(/is > was/.test(dock),
     'it announces a message arriving, not a count that merely exists');

  // EVERY CONVERSATION, AND SETTLED. This asserted a raw `subscribeToMyMessages`
  // channel until an audit found what that shape costs: it called back on every
  // single row event with nothing between them, so one insert by anybody became
  // one recount per open app, and a burst of forty messages became forty
  // recounts and up to forty notifications per viewer. The invariant is
  // unchanged -- the dock must notice a message in ANY thread -- but it is now
  // met by the hook that debounces, like every other screen in the app.
  ok(/useKeepUp\(KEEP_UP_TALK, refresh\)/.test(dock),
     'it watches every conversation through the hook that settles a burst into one reload');

  const data = read('lib/live/data.ts');
  ok(!/export function subscribeToMyMessages/.test(data),
     'and the unthrottled helper it used to call is gone rather than left lying about');
  ok(/SETTLE_MS/.test(read('lib/live/keep-up.ts')),
     'the hook it uses instead actually debounces');
}

// ---------------------------------------------------------------------------
// 5. IT IS REACHABLE FROM EVERY ROOM -- BY THE BUBBLE, NOT BY A NAVIGATION ROW
// ---------------------------------------------------------------------------
//
// THE INTENT OF THIS SECTION IS UNCHANGED AND THE CHECKS ARE REVERSED, which is
// worth writing down rather than quietly editing.
//
// It used to assert that `/talk` was in the navigation and came FIRST, and that
// was right when it was written: the chat should not be a card people scroll a
// page to reach. But an icon in the navigation is still a PLACE YOU GO. Tapping
// it left whatever you were reading, threw away where you had scrolled to, and
// put the conversation on a page of its own.
//
// Once the bubble worked at every screen size and opened OVER the page, that
// row became a second and worse way in to the same conversation -- the one that
// cost somebody their place. Reported with the icon circled in red: "you can
// take out the chat room now since we already have the bubble."
//
// So "reachable from every room" is now satisfied by the dock being mounted
// once in the shell, and the absence of the row is itself checked -- because
// adding it back would look like a helpful restoration to anybody who had not
// read this.
{
  const shell = read('components/LiveAppShell.tsx');

  ok(/<TalkDock \/>/.test(shell),
     'the dock is mounted once in the shell, so the chat is reachable from every room');

  // MEASURED WITH COMMENTS BLANKED, because the note above the section list in
  // LiveAppShell has to name `/talk` to explain why it is not there.
  const code = shell.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
                             (m) => ' '.repeat(m.length));
  ok(!/href: '\/talk'/.test(code),
     'and the navigation no longer offers a separate room that would cost you your page');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);

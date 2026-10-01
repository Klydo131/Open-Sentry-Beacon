// The chat keeps working on a database that has not had its update yet.
//
// ---------------------------------------------------------------------------
// Asked for on 1 October 2026. The owner's own database stays exactly as it is,
// and the code goes out anyway, so that every fork gets the whole app at once.
// The same is true of any church that updates its code before running
// `supabase db push`: the site changes in minutes, the database when somebody
// gets to it.
//
// So on a database without migration 20261001120000:
//   * the conversation is the words, the photos and the live refresh, as it
//     was -- in particular the messages' live channel never names the reactions
//     table, which that database does not have;
//   * reply, react and voice are simply not offered, rather than offered and
//     refused;
//   * and they switch on by themselves once the database has them.
//
// A missing table is told apart from a real failure (lib/live/not-yet.ts): a
// dropped network or a refusal by a security rule is still an error.
//
//   node tests/the-chat-works-before-its-database-update.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (p) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// 1. TELLING "NOT HERE YET" FROM "SOMETHING WENT WRONG" ---------------------------
{
  const js = ts.transpileModule(read('lib/live/not-yet.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  const { isMissingFromDatabase, NotOnThisDatabaseYet } = mod.exports;

  const missing = [
    { code: 'PGRST205', message: "Could not find the table 'public.message_reactions' in the schema cache" },
    { code: 'PGRST204', message: "Could not find the 'reply_to' column of 'messages' in the schema cache" },
    { code: 'PGRST202', message: 'Could not find the function public.react_to(p_emoji, p_media, p_message) in the schema cache' },
    { code: '42P01', message: 'relation "public.message_reactions" does not exist' },
    { code: '42703', message: 'column messages.reply_to does not exist' },
    { code: '', message: 'relation "public.message_reactions" does not exist' },
  ];
  ok(missing.every(isMissingFromDatabase), 'a table, column or function that is not there reads as "not on this database yet"');
  const real = [
    { code: '42501', message: 'permission denied for table message_reactions' },
    { code: 'PGRST301', message: 'JWT expired' },
    { code: '', message: 'TypeError: Failed to fetch' },
    { code: '57014', message: 'canceling statement due to statement timeout' },
    null,
    undefined,
  ];
  ok(!real.some(isMissingFromDatabase), 'a refusal, an expired sign-in, a dropped network or a timeout is still a real error');
  ok(new NotOnThisDatabaseYet('x') instanceof Error, 'and the signal is an Error, so nothing that catches errors misses it');
}

// 2. THE LIVE REFRESH NEVER DEPENDS ON THE NEW TABLE -----------------------------
{
  const keepUp = code('lib/live/keep-up.ts');
  const sets = [...keepUp.matchAll(/export const (KEEP_UP_\w+) = \[([^\]]*)\]/g)].map((m) => [m[1], m[2]]);
  const naming = sets.filter(([, tables]) => /'message_reactions'/.test(tables)).map(([name]) => name);
  ok(JSON.stringify(naming) === '["KEEP_UP_REACTIONS"]',
     `only KEEP_UP_REACTIONS names the reactions table (${naming.join(', ') || 'none'})`);
  ok(/KEEP_UP_TALK = \['messages', 'pairing_media'\]/.test(keepUp), 'so the messages\' live channel is exactly as it was');

  const surface = code('components/live/TalkSurface.tsx');
  const users = [...surface.matchAll(/useKeepUp\(KEEP_UP_REACTIONS, (\w+), (\w+)\)/g)];
  ok(users.length === 1 && users[0][2] === 'extras', 'and reactions are watched only once this database is known to have them');
  const elsewhere = ['components/live/TalkDock.tsx', 'components/live/ExplorerPage.tsx', 'components/live/GuidePages.tsx']
    .filter((f) => /KEEP_UP_REACTIONS/.test(code(f)));
  ok(elsewhere.length === 0, 'by the open conversation only, not by every screen with a chat badge');
}

// 3. NOTHING IS OFFERED THAT THE DATABASE WOULD REFUSE ---------------------------
{
  const data = code('lib/live/data.ts');
  ok(/throw isMissingFromDatabase\(error\) \? new NotOnThisDatabaseYet\(error\.message\) : new Error\(error\.message\)/.test(data),
     'reading reactions says plainly when the table is not there');

  const surface = code('components/live/TalkSurface.tsx');
  ok(/const \[extras, setExtras\] = useState\(false\)/.test(surface), 'the extras start OFF, so nothing appears and then fails');
  ok(/setReactions\(await live\.listReactions\(id\)\);\s*setExtras\(true\);/.test(surface)
     && /if \(cause instanceof live\.NotOnThisDatabaseYet\) setExtras\(false\);/.test(surface),
     'they switch on when reactions can be read, and off only for "not here yet"');
  ok(/onReact=\{extras \? react : undefined\}/.test(surface) && /extras=\{extras\}/.test(surface),
     'reacting, replying and voice follow that one answer');

  const shared = code('components/live/shared.tsx');
  ok(/replies=\{extras\}/.test(shared) && /voice=\{extras\}/.test(shared), 'the live conversation passes it to the chat');

  const view = code('components/talk/ChatView.tsx');
  ok(/if \(replies\) list\.push\(\{ key: 'reply'/.test(view), 'no Reply in the menu where replies are off');
  ok(/if \(replies && dx > 12/.test(view) && /if \(apply && replies && g\.dx >= SWIPE_REPLY\)/.test(view),
     'and no swipe: a bubble that follows the thumb promises something will happen');
  ok(/canReact=\{!!onReact\}/.test(view), 'no reactions row without a way to react');

  const sample = code('components/Chat.tsx');
  ok(!/replies=\{false\}|voice=\{false\}/.test(sample) && /<ChatView/.test(sample),
     'the sample app, which has everything, offers everything');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);

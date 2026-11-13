// A conversation can reply, react and speak -- and stays exactly as private.
//
// ---------------------------------------------------------------------------
// ASKED FOR ON 1 OCTOBER 2026: a chat that feels like the ones people already
// use, with reactions, replies and voice messages. Each of the three opened a
// way in that did not exist before, and this check holds the doors shut:
//
//   * a reaction is read by the two people in the pairing and written only
//     through react_to(), from a fixed six that the screen and the database
//     agree on;
//   * a reply cannot point outside its conversation, and sending a message
//     writes four columns and no others;
//   * the microphone is allowed for this site only, asked for on a tap, let go
//     when recording stops, and a recording is never sent on its own.
//
// The database half is ALSO exercised as real people, against a database built
// from nothing, by supabase/tests/a-conversation-can-reply-react-and-speak.sql
// in CI. This file checks the wiring that keeps it that way.
//
//   node tests/a-conversation-can-reply-react-and-speak.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const stripSql = (s) => s.replace(/--[^\n]*/g, '');
const stripTs = (s) => s.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const migration = stripSql(read('supabase/migrations/20261001120000_a_conversation_can_reply_react_and_speak.sql'));
const data = stripTs(read('lib/live/data.ts'));

// ---- 1. The six, the same six everywhere -------------------------------------
{
  const ts = read('lib/talk/reactions.ts');
  const screen = [...ts.matchAll(/emoji: '([^']+)'/g)].map((m) => m[1]);
  const lists = [...migration.matchAll(/in \(('[^)]*')\)/g)].map((m) =>
    [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
  ok(screen.length === 6 && screen[0] === '🙏', `the screen offers six, praying first (${screen.join(' ')})`);
  ok(lists.length >= 2, `the database names the set in the column check and in react_to() (${lists.length})`);
  const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  ok(lists.every((l) => same(l, screen)), 'and every list is exactly the screen\'s six');
}

// ---- 2. Reactions: read by the two, written only through react_to() ---------
{
  ok(/alter table public\.message_reactions enable row level security/.test(migration),
     'row security is on for reactions');
  ok(/create policy message_reactions_read on public\.message_reactions\s+for select to authenticated\s+using \(pairing_id in \(select private\.my_pairing_ids\(\)\)\)/.test(migration),
     'they are read only inside your own pairings');
  ok(/revoke all on public\.message_reactions from anon, authenticated;\s*grant select on public\.message_reactions to authenticated;/.test(migration),
     'a browser may read them and nothing else');
  ok(!/create policy [a-z_]+ on public\.message_reactions\s+for (insert|update|delete|all)/.test(migration),
     'and no policy opens a write');
  ok(/as restrictive for select to authenticated\s+using \(\(select private\.i_am_not_suspended\(\)\)\)/.test(migration),
     'a suspended account sees none of them, on the page or on the live feed');
  const fn = migration.slice(migration.indexOf('create or replace function private.react_to'));
  const body = fn.slice(0, fn.indexOf('$$;'));
  ok(/security definer/.test(body) && /set search_path to 'public', 'pg_temp'/.test(body),
     'react_to() is a definer function with a fixed search path');
  ok((body.match(/pairing_id in \(select private\.my_pairing_ids\(\)\)/g) ?? []).length === 2,
     'it finds the message or file only inside your own conversations');
  ok(/v_deleted is not null/.test(body), 'and refuses a message that was taken back');
  ok(body.indexOf('if v_pairing is null') > 0 && body.indexOf('if v_pairing is null') < body.indexOf('if v_deleted is not null'),
     'asking whose it is BEFORE whether it was taken back, so it cannot be used to probe message ids');
  ok(!/delete from public\.message_reactions/.test(body) && /set emoji = null/.test(body)
     && /emoji\s+text check \(emoji is null or emoji in/.test(migration),
     'taking a reaction back empties the row: a delete would reach every subscriber in every church');
  ok(/from private\.reaction_pace where person_id = v_me/.test(body) && /if v_recent >= 30 then/.test(body)
     && /revoke all on private\.reaction_pace from public, anon, authenticated/.test(migration),
     'and nobody changes reactions more than thirty times a minute');
  ok(/\.not\('emoji', 'is', null\)/.test(data), 'the app shows no reaction that was taken back');
  const prose = read('supabase/migrations/20261001120000_a_conversation_can_reply_react_and_speak.sql').replace(/\n--\s?/g, ' ');
  ok(/applies the read rule to inserts and updates only/.test(prose) && !/so the read rule can be applied to it/.test(prose),
     'and the migration says plainly what the realtime feed does with a delete');
  ok(/revoke all on function public\.react_to\(uuid, uuid, text\) from public, anon;/.test(migration),
     'and the signed-out role cannot call it');
  ok(/rpc\('react_to'/.test(data), 'the app reacts through the function');
  ok(!/from\('message_reactions'\)[\s\S]{0,160}\.(insert|update|upsert|delete)\(/.test(data),
     'and never writes the table');
  ok(/alter publication supabase_realtime add table/.test(migration) && /replica identity full/.test(migration)
     && /tables text\[\] := array\['message_reactions'\]/.test(migration),
     'reactions reach the other phone live, with the full row the read rule needs');
  ok(/'message_reactions'/.test(read('lib/live/keep-up.ts')), 'and the chat listens for them');
}

// ---- 3. Replies, and what sending may write ---------------------------------
{
  ok(/foreign key \(reply_to, pairing_id\)\s+references public\.messages \(id, pairing_id\)/.test(migration),
     'a reply is held to its own conversation by the database');
  ok(/revoke insert on public\.messages from authenticated;\s*grant\s+insert \(pairing_id, sender_id, body, reply_to\) on public\.messages to authenticated;/.test(migration),
     'sending writes four columns: no message arrives already "edited", "deleted" or "read"');
  ok(/pairing_id: pairingId,\s*sender_id: await uid\(\),\s*body: text,\s*\.\.\.\(replyTo \? \{ reply_to: replyTo \} : \{\}\)/.test(data),
     'and the app writes exactly those');
}

// ---- 4. The microphone -------------------------------------------------------
{
  const config = read('next.config.mjs');
  ok(/'Permissions-Policy', value: 'camera=\(\), microphone=\(self\), geolocation=\(\)'/.test(config),
     'the microphone is allowed for this site only; camera and location stay off');
  const voice = stripTs(read('lib/talk/voice.ts'));
  const start = voice.slice(voice.indexOf('const start = useCallback'), voice.indexOf('const finish = useCallback'));
  ok(/getUserMedia/.test(start) && (voice.match(/getUserMedia\(/g) ?? []).length === 1,
     'it is asked for in one place: when recording is started');
  ok(/getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/.test(voice) && /useEffect\(\(\) => \(\) => \{/.test(voice),
     'and let go when recording stops, is cancelled, or the chat closes');
  ok(/const mine = \+\+attempt\.current;\s*try \{\s*const media = await navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\);\s*if \(mine !== attempt\.current\) \{\s*media\.getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\);/.test(start),
     'a microphone granted after Cancel, or after the chat closed, is put straight back down');
  const cancelFn = voice.slice(voice.indexOf('const cancel = useCallback'));
  const unmount = voice.slice(voice.lastIndexOf('useEffect(() => () => {'));
  const finishFn = voice.slice(voice.indexOf('const finish = useCallback'), voice.indexOf('const cancel = useCallback'));
  ok([cancelFn, unmount, finishFn].every((f) => /attempt\.current \+= 1/.test(f.slice(0, 200))),
     'Cancel, Send and leaving each withdraw a request still waiting on the prompt');
  ok(/VOICE_MAX_MS = 2 \* 60 \* 1000/.test(voice), 'two minutes at most');
  const composer = stripTs(read('components/talk/Composer.tsx'));
  ok((composer.match(/voice\.finish\(\)/g) ?? []).length === 1 && /const sendVoice = async/.test(composer),
     'a recording is sent only by pressing Send, never on its own at the limit');
  ok(/'audio\/webm'/.test(read('lib/live/attachments.ts')) && /array_append\(allowed_mime_types, 'audio\/webm'\)/.test(migration),
     'the private store accepts what Chrome and Android record');
}

// ---- 5. Files: their pace, their titles ---------------------------------------
{
  ok(/for each row execute function private\.hold_the_pace\('owner_id', '10'\)/.test(migration)
     && /ceiling integer := coalesce\(nullif\(tg_argv\[1\], ''\)::integer, 40\)/.test(migration),
     'nobody sends more than ten files a minute, and messages keep their forty');
  ok(/pairing_media_title_plain check \(\s*char_length\(title\) between 1 and 200/.test(migration),
     'a file title is at most two hundred characters, with no hidden reversal');
  const thread = read('lib/talk/thread.ts');
  ok(/\[\\u202A-\\u202E\\u2066-\\u2069\]/.test(thread) && /plainTitle\(e\.title\)/.test(read('components/talk/ChatView.tsx')),
     'and an older title is cleaned before the chat draws it');
  ok(/title: plainTitle\(file\.name\)/.test(data) && /title: plainTitle\(file\.name\)/.test(read('lib/demo/store.tsx')),
     'both halves store a clean title');
}

// ---- 6. One chat, both halves, nothing injected -----------------------------
{
  ok(/<ChatView/.test(read('components/Chat.tsx')) && /<ChatView/.test(read('components/live/shared.tsx')),
     'the sample and the live chat draw the same conversation');
  const talk = fs.readdirSync(path.join(root, 'components/talk')).map((f) => read(`components/talk/${f}`)).join('\n');
  ok(!/dangerouslySetInnerHTML/.test(talk), 'nothing in the chat writes raw HTML');
  ok(/<Linked text=\{entry\.body\} \/>/.test(read('components/talk/ChatView.tsx')),
     'message words go through Linked, which only ever links http(s)');
  ok(/a-conversation-can-reply-react-and-speak\.sql/.test(read('scripts/fresh-install.sh')),
     'and CI exercises the database rules as people, on every push');
  const store = stripTs(read('lib/demo/store.tsx'));
  const react = store.slice(store.indexOf('const reactTo = useCallback'), store.indexOf('const markMessagesRead'));
  ok(/REACTIONS\.some\(\(r\) => r\.emoji === emoji\)/.test(react) && /pairing\.dm_id !== userId && pairing\.ds_id !== userId/.test(react),
     'the sample app keeps the same rules: the six, in your own conversation');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);

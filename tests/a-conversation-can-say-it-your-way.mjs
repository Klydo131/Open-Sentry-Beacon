// A conversation can say it your way, and stays ours while it does.
//
// Asked for on 14 November 2026: emoji to pick, stickers, a message sent with
// an effect and a look for your own side of the chat (lib/talk/expression.ts).
// Each of them could have opened a hole, so this holds the rules that keep
// them shut, by running the code rather than looking for words in it:
//
//   1. a sticker travels as words a person can read, and only a known one is
//      drawn; anything else is an ordinary message;
//   2. every sticker and every bubble colour carries ink that reads on it;
//   3. the emoji offered are plain, drawn by every phone, and none twice;
//   4. a look read from the device is one the app offers, whatever was stored;
//   5. an effect is one of five, checked by the app, the sample store and the
//      database, and a database without the column still gets the words;
//   6. nothing here calls another company's service;
//   7. the new control stays outside the message form, and everything that
//      moves stops for somebody who asked for less motion.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};
const read = (p) => readFileSync(p, 'utf8');

function load(path, modules = {}) {
  const js = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, (name) => {
    if (name in modules) return modules[name];
    throw new Error(`${path} asked for ${name}, which this check does not provide`);
  });
  return mod.exports;
}

const celebrate = load('lib/celebrate.ts');
const x = load('lib/talk/expression.ts', { '@/lib/celebrate': celebrate });

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};

// ---- 1. A sticker is words first ---------------------------------------------
{
  const every = x.STICKERS.every((s) => x.stickerOf(x.stickerBody(s)) === s);
  ok(x.STICKERS.length >= 8 && every, `each of the ${x.STICKERS.length} stickers survives the journey as words`);
  ok(x.stickerBody(x.STICKERS[0]) === '[sticker: Praying for you]', 'and the words say what it is');
  ok(x.stickerOf('[sticker: Something rude]') === undefined, 'a label the app does not know is not drawn as a sticker');
  ok(x.stickerOf('look: [sticker: Amen!]') === undefined && x.stickerOf('[sticker: Amen!] and more') === undefined,
    'nor is a sticker hidden inside a longer message');
  ok(x.stickerOf('[sticker: Amen!]\n[sticker: Amen!]') === undefined, 'nor two of them');
  ok(x.plainSnippet('[sticker: Amen!]') === '🙌 Amen! (sticker)' && x.plainSnippet('hello') === 'hello',
    'a quote or a menu names a sticker instead of showing its brackets');
  ok(new Set(x.STICKERS.map((s) => s.label)).size === x.STICKERS.length, 'no two stickers share a label');
  ok(x.STICKERS.every((s) => !/[\[\]\n]/.test(s.label) && s.label.length <= 40), 'a label can never break out of its brackets');
}

// ---- 2. Ink that reads --------------------------------------------------------
{
  const weak = x.STICKERS.filter((s) => contrast(s.ground, s.ink) < 4.5).map((s) => s.label);
  ok(weak.length === 0, `every sticker's words read on its ground at 4.5:1${weak.length ? ` (not: ${weak.join(', ')})` : ''}`);
  const colours = x.BUBBLE_COLOURS.filter((c) => c.ground);
  const faint = colours.filter((c) => contrast(c.ground, c.ink) < 4.5).map((c) => c.key);
  ok(colours.length >= 5 && faint.length === 0, `every bubble colour carries ink that reads${faint.length ? ` (not: ${faint.join(', ')})` : ''}`);
  ok(colours.every((c) => /^#[0-9a-f]{6}$/.test(c.ground) && /^#[0-9a-f]{6}$/.test(c.ink)), 'a colour is a plain colour and nothing else');
  ok(x.BUBBLE_COLOURS[0].ground === '' && x.WALLPAPERS[0].className === '',
    'the first of each is the app\'s own, which sets nothing at all');
}

// ---- 3. Plain emoji ------------------------------------------------------------
{
  const all = x.EMOJI_GROUPS.flatMap((g) => g.emoji);
  ok(all.length >= 60 && new Set(all).size === all.length, `${all.length} emoji are offered, none twice`);
  const banned = all.filter((e) => [...e].some((ch) => { const c = ch.codePointAt(0); return c >= 0x2300 && c <= 0x23ff; }));
  ok(banned.length === 0, `none is from the block Android draws as an empty box${banned.length ? ` (${banned.join(' ')})` : ''}`);
  const drink = ['🍺', '🍻', '🍷', '🥂', '🍸', '🍹', '🥃', '🍾', '🍶', '☕', '🍵', '🚬'];
  ok(!all.some((e) => drink.includes(e.replace('️', ''))), 'none is a drink or a smoke');
  const pictographic = /^\p{Extended_Pictographic}/u;
  ok(all.every((e) => pictographic.test(e)), 'every one is a real emoji');
}

// ---- 4. A look is one the app offers -------------------------------------------
{
  const junk = x.tidyLook({ colour: 'red; background:url(//evil)', paper: '<script>' });
  ok(junk.colour === 'standard' && junk.paper === 'standard', 'a look the app does not offer becomes the standard one');
  ok(x.tidyLook(null).colour === 'standard' && x.tidyLook('x').paper === 'standard', 'and so does nonsense');
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  x.writeLook(storage, 'person-1', { colour: 'violet', paper: 'dawn' });
  ok(x.readLook(storage, 'person-1').colour === 'violet' && x.readLook(storage, 'person-2').colour === 'standard',
    'a look is kept for the person who chose it, not for whoever uses the device next');
  store.set(x.lookKey('person-1'), '{not json');
  ok(x.readLook(storage, 'person-1').paper === 'standard', 'a damaged entry is the standard look, not an error');
  const refuses = { getItem: () => { throw new Error('private window'); }, setItem: () => { throw new Error('private window'); } };
  let threw = false;
  try { x.writeLook(refuses, 'p', x.STANDARD_LOOK); x.readLook(refuses, 'p'); } catch { threw = true; }
  ok(!threw, 'a device that refuses storage does not break the chat');
  ok(x.lookKey('a/b c<d>') === 'hb-chat-look:abcd', 'the key holds an id and nothing that could be anything else');
}

// ---- 5. An effect is one of five, everywhere ------------------------------------
{
  ok(x.EFFECTS.length === 5 && x.EFFECTS.every((e) => x.isEffect(e)), 'five effects, each known to the app');
  ok(!x.isEffect('explode') && !x.isEffect(null) && !x.isEffect(7), 'and nothing else is one');
  const sql = read('supabase/migrations/20261114120000_a_conversation_can_say_it_your_way.sql');
  const inDb = [...(sql.match(/effect is null or effect in \(([^)]*)\)/)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  ok(inDb.length === 5 && x.EFFECTS.every((e) => inDb.includes(e)), `the database checks the same five (${inDb.join(', ')})`);
  ok(/grant\s+insert \(pairing_id, sender_id, body, reply_to, effect\) on public\.messages to authenticated;/.test(sql)
     && /revoke insert on public\.messages from authenticated;/.test(sql),
    'sending may write five columns and still no others');
  const data = read('lib/live/data.ts');
  const send = data.slice(data.indexOf('export async function sendMessage('), data.indexOf('/** Every reaction in one conversation. */'));
  ok(/isEffect\(effect\) \? \{ \.\.\.row, effect \} : row/.test(send), 'the live app sends only an effect it knows');
  ok(/withEffect !== row && isMissingFromDatabase\(error\)/.test(send) && /insert\(row\)/.test(send),
    'and a database without the column yet still gets the words');
  const store = read('lib/demo/store.tsx');
  ok(/\.\.\.\(isEffect\(effect\) \? \{ effect \} : \{\}\)/.test(store), 'the sample app keeps the same rule');
  ok(/expressive=\{extras && messages\.some\(\(m\) => 'effect' in m\)\}/.test(read('components/live/shared.tsx')),
    'the live chat offers effects and more reactions only once its database has them');
}

// ---- 6. Nothing leaves ------------------------------------------------------------
{
  const files = ['lib/talk/expression.ts', 'components/talk/ExpressionPanel.tsx'];
  const reaching = files.filter((f) => /fetch\(|XMLHttpRequest|https?:\/\/|<img|<iframe|import\(/.test(read(f)));
  ok(reaching.length === 0, `emoji, stickers and looks call nobody and load nothing${reaching.length ? ` (${reaching.join(', ')})` : ''}`);
}

// ---- 7. Where it sits, and what stops ----------------------------------------------
{
  const composer = read('components/talk/Composer.tsx');
  const face = composer.indexOf('data-expression');
  const form = composer.indexOf('<form');
  const formEnd = composer.indexOf('</form>');
  ok(face > 0 && form > 0 && (face < form || face > formEnd),
    'the smiling face is outside the message form, so the form still holds one box and one button');
  const css = read('app/globals.css');
  const calm = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  ok(['.sticker-bounce', '.sticker-wiggle', '.sticker-pulse', '.sticker-float'].every((c) => calm.includes(c)) && /animation: none/.test(calm),
    'a sticker does not move for somebody who asked for less motion');
  const motions = new Set(x.STICKERS.map((s) => s.motion));
  ok([...motions].every((m) => css.includes(`.sticker-${m} {`)), 'every way a sticker moves is drawn');
  ok(x.WALLPAPERS.filter((w) => w.className).every((w) => css.includes(`.${w.className}`)), 'and every ground behind a chat is drawn');
  const view = read('components/talk/ChatView.tsx');
  ok(/if \(landed\.current && newest\?\.kind === 'message' && !newest\.deletedAt\) playEffect\(newest\);/.test(view),
    'an effect plays as a message arrives, never on opening an old conversation');
}

console.log(bad === 0 ? '\nAll chat expression rules hold.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);

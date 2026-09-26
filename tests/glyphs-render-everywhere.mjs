// No character on screen may depend on a font nobody promised.
//
// THE BUG, circled on an Android phone: the sign-out button in the header was
// an empty box. A tofu box is what a font draws when it has no glyph for a
// character.
//
// The character was `⏻`, U+23FB POWER SYMBOL, and that is the whole trap: it
// LOOKS like an emoji and is not one. Emoji have a guaranteed fallback, because
// every phone ships a colour emoji font covering the emoji set. A symbol from
// Miscellaneous Technical has no such promise; it is drawn only if the text
// font happens to carry it. Apple's system font does. Android's Noto Sans does
// not. So it was correct on the iPhone it was written on, correct on the Mac it
// was reviewed on, and a blank box for every Android user in the church.
//
// WHY A TEST AND NOT JUST A FIX. Nothing about `⏻` in a source file looks
// wrong, and nothing in a browser here can tell you: this sandbox renders with
// whatever fonts it has, which are not the phone's. The failure is invisible at
// every point where somebody might catch it. That is the definition of a thing
// that needs a rule.
//
// THE RULE: a character in shipped, user-visible text must be either
//   * ASCII, or ordinary punctuation every text font carries, or
//   * a real emoji, which every platform's emoji font covers,
// and never a symbol from a block that is neither.
//
// Icons that must be pressed are drawn in components/Glyph.tsx instead. An
// inline SVG has no font behind it at all.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  if (statSync(full).isDirectory()) return walk(full);
  return /\.tsx?$/.test(name) ? [full] : [];
});
const files = [...walk('components'), ...walk('app'), ...walk('lib')];

// WHAT COUNTS AS SAFE, decided by Unicode's own data rather than by opinion.
// Node carries the tables, so `\p{Emoji_Presentation}` here is the real answer
// for the Unicode version this Node ships, not a list somebody typed once.
//
//   Emoji_Presentation=Yes  -> safe. Every platform ships a colour emoji font
//                              covering the emoji set, so it always draws.
//   Extended_Pictographic,  -> AMBIGUOUS. It defaults to the TEXT glyph, which
//   Emoji_Presentation=No      the emoji font is not asked for. Add U+FE0F and
//                              it becomes safe. That costs nothing, so this is
//                              treated as a fault rather than a preference.
//   Neither                 -> not an emoji at all. Safe only if it is ordinary
//                              punctuation every text font carries.
//
// HONEST ABOUT THE LIMIT OF THE LAST LINE. Whether a given text symbol is in a
// given phone's font is not something Unicode records and not something this
// sandbox can measure: there is no Android here. Miscellaneous Technical is
// banned because a device proved it, in a screenshot. The rest of the symbol
// blocks are allowed by judgement, because Android bundles Noto Sans Symbols
// and they have never been reported. If another box turns up, add its block
// below and draw the character instead.
const BANNED_BLOCKS = [
  // PROVEN on an Android phone: U+23FB rendered as a box in the header.
  [0x2300, 0x23FF, 'Miscellaneous Technical'],
];

// Punctuation and symbols with coverage broad enough to rely on. Arrows and the
// ellipses are in every text font worth the name; the quotes and dashes are
// ordinary typography. The copyright sign is Latin-1, in every text font there
// is, and it is wanted AS TEXT: OpenStreetMap's credit under the place
// suggestions reads "© OpenStreetMap contributors", and U+FE0F would turn it
// into a coloured emoji badge in the middle of a line of small print.
const KNOWN_SAFE = new Set([...'←↑→↓↗↩↺↻⇄⋮⋯›‹–—…·×°′″“”‘’•✓✕✖▲▴▼▾▶▸●○☰❚✦✝✍✉✈⚖⚙⚠⚡©']);

const inBanned = (code) => BANNED_BLOCKS.find(([lo, hi]) => code >= lo && code <= hi);

/**
 * Blank out every comment, keeping line numbers and line lengths.
 *
 * A line-by-line guess is not enough: a JSX comment spans several lines and its
 * continuation lines start with plain prose, so the note explaining THIS bug
 * was itself reported as the bug.
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      // Keep the newlines so line numbers still line up.
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (src.startsWith('//', i)) {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else {
      out += src[i];
      i += 1;
    }
  }
  return out;
}

const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

// ---------------------------------------------------------------------------
// 1. Nothing from the block that was proven to fail.
// ---------------------------------------------------------------------------
{
  const offenders = [];
  for (const file of files) {
    if (file.endsWith('Glyph.tsx')) continue;
    const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      for (const ch of line) {
        const code = ch.codePointAt(0);
        if (code < 128) continue;
        const block = inBanned(code);
        if (block) {
          offenders.push(
            `${file}:${i + 1}  ${ch}  U+${code.toString(16).toUpperCase().padStart(4, '0')}  (${block[2]})`,
          );
        }
      }
    });
  }
  ok(offenders.length === 0,
    offenders.length
      ? `Miscellaneous Technical is a blank box on Android:\n        ${offenders.join('\n        ')}`
      : 'nothing uses Miscellaneous Technical, the block that was proven to fail');
}

// ---------------------------------------------------------------------------
// 2. Every pictograph asks for the emoji font.
// ---------------------------------------------------------------------------
// A character that IS an emoji but does not default to emoji presentation gets
// the text glyph unless U+FE0F follows it, and the text glyph is the one with
// no guaranteed font. `⬆`, `👁`, `▶` and both skip arrows were all written that
// way. The fix is one invisible character, so there is no reason not to.
{
  const offenders = [];
  for (const file of files) {
    if (file.endsWith('Glyph.tsx')) continue;
    const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      const chars = [...line];
      chars.forEach((ch, j) => {
        if (ch.codePointAt(0) < 128) return;
        if (KNOWN_SAFE.has(ch)) return;
        const pictographic = /\p{Extended_Pictographic}/u.test(ch);
        const alwaysEmoji = /\p{Emoji_Presentation}/u.test(ch);
        if (pictographic && !alwaysEmoji && chars[j + 1] !== '\uFE0F') {
          offenders.push(
            `${file}:${i + 1}  ${ch}  U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
          );
        }
      });
    });
  }
  ok(offenders.length === 0,
    offenders.length
      ? `these are emoji that did not ask for the emoji font (add U+FE0F):\n        ${offenders.join('\n        ')}`
      : 'every emoji that needs to asks for the emoji font');
}

// ---------------------------------------------------------------------------
// 2b. Nothing forces the TEXT presentation.
// ---------------------------------------------------------------------------
// U+FE0E is the opposite request: do NOT use the emoji font, which is the one
// font guaranteed to have the character. `⚠︎` was written that way twice.
{
  const offenders = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (isComment(line)) return;
      if (line.includes('\uFE0E')) offenders.push(`${file}:${i + 1}`);
    });
  }
  ok(offenders.length === 0,
    offenders.length
      ? `these refuse the emoji font:\n        ${offenders.join('\n        ')}`
      : 'nothing refuses the emoji font by asking for a text presentation');
}

// ---------------------------------------------------------------------------
// 3. The icons a person must press are drawn, not typed.
// ---------------------------------------------------------------------------
{
  const glyphs = readFileSync('components/Glyph.tsx', 'utf8');
  for (const name of [
    'PowerGlyph', 'PlayGlyph', 'PauseGlyph', 'PreviousGlyph', 'NextGlyph',
    'BackGlyph', 'ForwardGlyph', 'CloseGlyph', 'ChevronGlyph', 'MenuGlyph', 'KebabGlyph',
  ]) {
    ok(new RegExp(`export function ${name}\\b`).test(glyphs), `${name} is drawn`);
  }
  ok(/stroke="currentColor"/.test(glyphs),
    'and they take their colour from the text around them, so themes still work');
  ok(!/<image|xlink:href|url\(/.test(glyphs),
    'with nothing to download: an icon that needs a request can fail like a font can');

  // The sign-out button in particular, since that is the one that was reported.
  const shell = readFileSync('components/LiveAppShell.tsx', 'utf8');
  ok(/PowerGlyph/.test(shell), 'the sign-out button uses the drawn power icon');
  const shipped = stripComments(shell);
  ok(!shipped.includes('\u23FB'),
    'and U+23FB is gone from what ships (the comment explaining it may keep it)');
  ok(/aria-label="Sign out"/.test(shell),
    'and it still says what it is to a screen reader, which a drawing cannot');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);

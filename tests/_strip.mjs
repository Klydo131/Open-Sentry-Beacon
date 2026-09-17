// Blanking comments without blanking the code.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS, AND IT IS NOT TIDINESS. Fifty test files each carry
// their own copy of these two functions, pasted from the first one that needed
// them, and the SQL one has a flaw every copy shares:
//
//     src.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, blank)
//
// `--` starts a comment in SQL and also appears INSIDE STRING LITERALS. The
// study room's link classifier tests a host for `xn--`, the prefix that marks a
// punycode domain -- one written in letters chosen to look like other letters,
// which is how a phishing address is made to read as a real one. Stripped, that
// rule vanishes, and a check asserting the classifier knows about punycode
// reported a missing feature that was there all along. That has now happened
// twice, and both times it was written up as "can only produce a false FAIL,
// which is the safe direction" -- true, and it still cost a round trip each
// time, and a false FAIL on a security rule is exactly the one somebody
// eventually silences.
//
// THE SAFE DIRECTION IS NOT THE SAME AS SAFE. A stripper that eats real code
// cannot let a bug through, but it can teach the person reading its output that
// red lines are sometimes noise, and that lesson is the expensive one.
//
// LENGTH IS PRESERVED, in both functions and for the same reason: a position
// reported against the stripped text still points at the right line and column
// of the file somebody will open. Every caller that prints a line number
// depends on it.
// ---------------------------------------------------------------------------

/** Replace every character of `text` with a space, keeping newlines. */
const blank = (text) => text.replace(/[^\n]/g, ' ');

/**
 * SQL with its comments blanked out, and its string literals left alone.
 *
 * Walks the source rather than running a regular expression over it, because
 * the question "is this `--` a comment" cannot be answered without knowing
 * whether it is inside a literal, and that is state a regex does not carry.
 *
 * Handles the three things Postgres actually uses:
 *   'a quoted string'        with '' as an escaped quote
 *   $$ a dollar-quoted body $$ and $tag$ ... $tag$
 *   -- to end of line, and slash-star to star-slash, which nest in Postgres
 */
export function stripSql(src) {
  let out = '';
  let i = 0;

  while (i < src.length) {
    const rest = src.slice(i);

    // A single-quoted string. '' inside it is an escaped quote, not the end.
    if (src[i] === "'") {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "'" && src[j + 1] === "'") { j += 2; continue; }
        if (src[j] === "'") { j += 1; break; }
        j += 1;
      }
      out += src.slice(i, j);
      i = j;
      continue;
    }

    // A dollar-quoted body: $$ ... $$ or $name$ ... $name$.
    const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(rest);
    if (dollar) {
      const tag = dollar[0];
      const end = src.indexOf(tag, i + tag.length);
      const stop = end === -1 ? src.length : end + tag.length;
      // KEPT WHOLE AND THEN STRIPPED INSIDE. A function body is SQL too and its
      // comments should go, but the $$ markers are not a licence to treat the
      // body as one opaque string: the old regex did neither and simply ran
      // over the top of them.
      out += tag + stripSql(src.slice(i + tag.length, stop - tag.length)) + tag;
      i = stop;
      continue;
    }

    // A line comment, now that we know we are not inside a literal.
    if (src.startsWith('--', i)) {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      out += blank(src.slice(i, stop));
      i = stop;
      continue;
    }

    // A block comment. Postgres nests these, so count the depth.
    if (src.startsWith('/*', i)) {
      let depth = 1;
      let j = i + 2;
      while (j < src.length && depth > 0) {
        if (src.startsWith('/*', j)) { depth += 1; j += 2; continue; }
        if (src.startsWith('*/', j)) { depth -= 1; j += 2; continue; }
        j += 1;
      }
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }

    out += src[i];
    i += 1;
  }

  return out;
}

/**
 * TypeScript and JSX with their comments blanked out.
 *
 * THE SAME FLAW IS POSSIBLE HERE and is quieter: `//` inside a string is
 * every URL in the app. `'https://faithlife.com'` stripped by a naive regex
 * becomes `'https:` and an assertion about an address silently tests nothing.
 * The walk is the same shape, with the literals JavaScript has.
 */
export function stripTs(src) {
  let out = '';
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === ch) { j += 1; break; }
        j += 1;
      }
      out += src.slice(i, j);
      i = j;
      continue;
    }

    // A JSX comment, which is a block comment inside braces.
    if (src.startsWith('{/*', i)) {
      const end = src.indexOf('*/}', i);
      const stop = end === -1 ? src.length : end + 3;
      out += blank(src.slice(i, stop));
      i = stop;
      continue;
    }

    if (src.startsWith('//', i)) {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      out += blank(src.slice(i, stop));
      i = stop;
      continue;
    }

    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += blank(src.slice(i, stop));
      i = stop;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

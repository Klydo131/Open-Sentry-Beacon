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
 * Tokens after which a `/` opens a REGULAR EXPRESSION rather than dividing.
 *
 * Deliberately an allowlist and not the other way round; the reasoning is in
 * the comment above stripTs.
 */
const OPENS_A_VALUE = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', ';', '{', '}', '+', '*', '%',
  '^', '~',
]);

const WORDS_BEFORE_A_REGEX = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'case', 'do', 'else', 'yield', 'await',
]);

/**
 * TypeScript and JSX with their comments blanked out.
 *
 * THE SAME FLAW IS POSSIBLE HERE and is quieter: `//` inside a string is
 * every URL in the app. `'https://faithlife.com'` stripped by a naive regex
 * becomes `'https:` and an assertion about an address silently tests nothing.
 * The walk is the same shape, with the literals JavaScript has.
 *
 * ---------------------------------------------------------------------------
 * AND A REGULAR EXPRESSION IS A LITERAL TOO, which this did not know for a
 * while, and getting it wrong is worse than the bug above rather than milder.
 *
 * `const RE = /[`'"]/;` is a character class listing three quote marks. Reading
 * it character by character with no notion of a regex, the backtick is the
 * start of a template literal -- so the scanner copies everything through
 * until the NEXT backtick, wherever that is, and from there it is out of step
 * with the file. Comments come back unstripped.
 *
 * That is the dangerous direction. The `xn--` bug this file was written for ate
 * real code, so a rule could go missing and a check would go red: loud, and
 * safe. This one hands a check the comments it asked to have removed, so a rule
 * that exists only in a PARAGRAPH OF PROSE reads as a rule that is implemented.
 * That is a false PASS, and nobody goes looking for those. Measured across this
 * repository when it was found: 51 source files out of 485 came back with
 * comments still in them.
 *
 * TELLING A REGEX FROM A DIVISION CANNOT BE DONE WITHOUT THE PRECEDING TOKEN,
 * and not always then -- `(a + b) / c` and `if (x) /re/.test(y)` differ only in
 * what the parenthesis was for. So this uses an ALLOWLIST: a `/` opens a regex
 * only after something that clearly cannot end a value. Everything else is
 * division.
 *
 * The allowlist is the way round it is because of JSX, where the denylist is
 * actively wrong. `</div>` puts a `/` after `<`, and `<p>and/or</p>` puts one
 * in running text after `>`. Guess "regex" at either and the scanner runs to
 * the next `/` in the file and desynchronises -- exactly the fault being fixed.
 * Guess "division" at a real regex and the worst case is its contents read as
 * code, which the single-line rules below keep to one line.
 *
 * TWO MORE BOUNDS, both of which stop a desynchronisation from spreading:
 *
 *   - A quoted string and a regex literal may not contain a raw newline, so
 *     neither scan crosses one. A mistake costs one line rather than a file.
 *   - Reaching the end of the source still inside a template literal means the
 *     walk lost its place. That is not a file this can strip honestly, so it
 *     throws instead of returning something that looks fine.
 *
 * `${ }` inside a template literal is CODE, and is walked as code -- with its
 * own brace depth, so `${ {a: 1}.a }` closes in the right place and a template
 * nested inside an interpolation is a template rather than the end of the
 * outer one.
 * ---------------------------------------------------------------------------
 */
export function stripTs(src) {
  let out = '';
  let i = 0;

  // The last significant character of code, and the identifier or number just
  // finished, if the last thing was one. Whitespace and comments change
  // neither: they are not tokens, and `return /re/` has a space in it.
  let prevChar = '';
  let prevBefore = '';
  let prevWord = '';

  // Where we are. Each entry is either the string 'template' -- inside the text
  // of a template literal -- or an object counting brace depth inside a `${ }`.
  const nest = [];
  const inside = () => nest[nest.length - 1];

  const lineAt = (at) => src.slice(0, at).split('\n').length;

  const sawToken = (ch, word = '') => {
    prevBefore = prevChar; prevChar = ch; prevWord = word;
  };

  while (i < src.length) {
    // ---- the text of a template literal ----------------------------------
    if (inside() === 'template') {
      const ch = src[i];
      if (ch === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
      if (ch === '`') { out += ch; i += 1; nest.pop(); sawToken('`'); continue; }
      if (src.startsWith('${', i)) {
        out += '${'; i += 2; nest.push({ braces: 0 }); sawToken('{');
        continue;
      }
      out += ch; i += 1;
      continue;
    }

    // ---- code -------------------------------------------------------------
    const ch = src[i];

    // Whitespace and comments are not tokens, so they leave `prev` alone.
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      out += ch; i += 1; continue;
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

    // A regular expression, but only where a value can begin.
    // `=>` opens a value and a bare `>` does not, which is the whole reason
    // the character before the last one is tracked: `(f) => /re/.test(f)` and
    // `<p>and/or</p>` both put a `/` after a `>`.
    const afterArrow = prevChar === '>' && prevBefore === '=';
    if (ch === '/' && (prevWord
      ? WORDS_BEFORE_A_REGEX.has(prevWord)
      : prevChar === '' || afterArrow || OPENS_A_VALUE.has(prevChar))) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < src.length) {
        const c = src[j];
        if (c === '\\') { j += 2; continue; }
        if (c === '\n') break;
        if (inClass) { if (c === ']') inClass = false; }
        else if (c === '[') inClass = true;
        else if (c === '/') { j += 1; closed = true; break; }
        j += 1;
      }
      if (closed) {
        while (j < src.length && /[a-z]/i.test(src[j])) j += 1;
        out += src.slice(i, j); i = j; sawToken('/');
        continue;
      }
      // No closing slash on this line, so it was a division after all. Fall
      // through and emit the one character.
    }

    // A quoted string, which cannot run past the end of its line.
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      let closed = false;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '\n') break;
        if (src[j] === ch) { j += 1; closed = true; break; }
        j += 1;
      }
      // A QUOTE WITH NO PARTNER ON ITS OWN LINE WAS NEVER A STRING, and this
      // is what makes the walk survive JSX. `<p>Time's up.</p>` is text, and
      // the apostrophe in it is a letter as far as anybody reading is
      // concerned. Treated as an opener it swallows the rest of the file;
      // treated as the ordinary character it is, nothing happens at all.
      if (!closed) { out += ch; i += 1; sawToken(ch); continue; }
      out += src.slice(i, j); i = j; sawToken(ch);
      continue;
    }

    if (ch === '`') {
      out += ch; i += 1; nest.push('template'); sawToken('`');
      continue;
    }

    // Braces, which close a `${ }` only at depth zero.
    if (ch === '{' && typeof inside() === 'object') {
      inside().braces += 1; out += ch; i += 1; sawToken('{');
      continue;
    }
    if (ch === '}' && typeof inside() === 'object') {
      // At depth zero this `}` ends the interpolation, and the template text
      // it was embedded in resumes underneath.
      if (inside().braces === 0) nest.pop();
      else inside().braces -= 1;
      out += ch; i += 1; sawToken('}');
      continue;
    }

    // An identifier or a number, kept whole so the keyword test above can see
    // `return` rather than the letter `n`.
    if (/[A-Za-z0-9_$]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j += 1;
      const word = src.slice(i, j);
      out += word; i = j; sawToken(word[word.length - 1], word);
      continue;
    }

    out += ch; i += 1; sawToken(ch);
  }

  if (nest.length) {
    throw new Error(
      'stripTs: the source ended inside a template literal. The walk has lost ' +
      'its place -- most likely a backtick it read as an opener was inside ' +
      'something it does not understand -- so anything it returned would have ' +
      'comments still in it.',
    );
  }

  return out;
}

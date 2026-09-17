// The thing that removes comments does not remove code.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS, WRITTEN DOWN AFTER IT BIT TWICE. Fifty test files in this
// repo blank out comments before searching a file, so a rule mentioned in a
// paragraph of reasoning is not mistaken for a rule that is implemented. Every
// one of them carried the same pasted line:
//
//     src.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, blank)
//
// `--` starts a comment in SQL. It also appears inside string literals. The
// study room's link classifier tests a host for `xn--`, the prefix on a
// punycode domain -- a name written in letters chosen to look like other
// letters, which is how a phishing address is made to read as a real one.
// Stripped by that line, the rule disappears, and a check asserting the
// classifier knows about punycode reported a missing feature that was there.
//
// BOTH TIMES IT WAS EXCUSED THE SAME WAY: "it can only ever produce a false
// FAIL, which is the safe direction". That is true and it is not the same as
// safe. A stripper that eats real code cannot let a bug through, but it does
// teach whoever reads the output that a red line is sometimes noise, and that
// is the lesson which eventually gets a real failure waved past.
//
// It was on the task list as "give the comment-stripper its own test" through
// three reports. This is that test, and the shared implementation it tests is
// tests/_strip.mjs.
//
//   node tests/the-comment-stripper-keeps-the-code.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stripSql, stripTs } from './_strip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// ---------------------------------------------------------------------------
// 1. IT REMOVES WHAT IT IS FOR
// ---------------------------------------------------------------------------
{
  ok(!/secret/.test(stripSql('select 1; -- a secret note\nselect 2;')),
     'a line comment goes');
  ok(!/secret/.test(stripSql('select /* a secret note */ 1;')),
     'a block comment goes');
  // Postgres nests block comments; a non-nesting reader stops at the first
  // close and leaves the tail of the comment behind as if it were code.
  ok(!/secret/.test(stripSql('select /* outer /* inner */ secret */ 1;')),
     'and a nested block comment goes all the way to its own end');
  ok(!/secret/.test(stripTs('const a = 1; // a secret note')),
     'a JavaScript line comment goes');
  ok(!/secret/.test(stripTs('<div>{/* a secret note */}</div>')),
     'and a JSX comment goes');
}

// ---------------------------------------------------------------------------
// 2. AND NOTHING ELSE
// ---------------------------------------------------------------------------
//
// Each of these is a real line from this codebase, or the shape of one.
{
  const punycode = "if host like 'xn--%' then return 'harmful'; end if;";
  ok(stripSql(punycode).includes('xn--'),
     'a `--` inside a SQL string is not a comment (xn--, the punycode rule)');

  const shortener = "if host ~ '^(bit\\.ly|tiny\\.cc)$' then";
  ok(stripSql(shortener).includes('bit\\.ly'),
     'and a regex inside a string survives');

  const escaped = "comment on table x is 'it''s -- not a comment';\nselect 2;";
  ok(stripSql(escaped).includes("-- not a comment"),
     'an escaped quote does not end the string early');

  const body = "create function f() returns int language plpgsql as $$\nbegin\n  -- gone\n  return 1;\nend;\n$$;";
  const strippedBody = stripSql(body);
  ok(!/gone/.test(strippedBody), 'comments inside a dollar-quoted body still go');
  ok(/return 1;/.test(strippedBody), 'and the body itself is kept');

  const tagged = "as $fn$ select 'a -- b' $fn$;";
  ok(stripSql(tagged).includes('a -- b'),
     'a tagged dollar-quote is understood, and strings inside it are safe');

  const url = "const home = 'https://faithlife.com'; // a note";
  const strippedUrl = stripTs(url);
  ok(strippedUrl.includes('https://faithlife.com'),
     'a `//` inside a JavaScript string is not a comment (every URL in the app)');
  ok(!/a note/.test(strippedUrl), 'while the real comment beside it still goes');

  ok(stripTs('const s = "a // b";').includes('a // b'), 'double quotes too');
  ok(stripTs('const s = `a // b`;').includes('a // b'), 'and template literals');
  ok(stripTs("const s = 'it\\'s // fine';").includes('// fine'),
     'a backslash-escaped quote does not end the string early');
}

// ---------------------------------------------------------------------------
// 3. POSITIONS STILL POINT AT THE RIGHT LINE
// ---------------------------------------------------------------------------
//
// Several checks report a line number so somebody can open the file at the
// fault. A stripper that shortens the text sends them to the wrong line, which
// is worse than not reporting one at all.
{
  const src = 'select 1; -- note\nselect 2; /* two\nlines */\nselect 3;\n';
  const stripped = stripSql(src);
  ok(stripped.length === src.length, 'stripped SQL is the same length as the source');
  ok(stripped.split('\n').length === src.split('\n').length,
     'and has the same number of lines');

  const ts = "const a = 1; // note\n/* two\nlines */\nconst b = 2;\n";
  const strippedTs = stripTs(ts);
  ok(strippedTs.length === ts.length, 'stripped TypeScript is the same length');
  ok(strippedTs.split('\n').length === ts.split('\n').length, 'and the same number of lines');
}

// ---------------------------------------------------------------------------
// 4. THE REAL FILES IT IS POINTED AT
// ---------------------------------------------------------------------------
//
// The end-to-end version of the same question: run it over every migration in
// the repo and check that nothing which looks like a rule has vanished. This is
// what would have caught the punycode case without anybody thinking of it.
{
  const dir = path.join(root, 'supabase/migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
  ok(files.length > 0, `there are migrations to check (${files.length})`);

  // ONLY THE LITERALS THAT CAN ACTUALLY BE DAMAGED. A literal that happens to
  // sit inside a comment is supposed to disappear with it, and asking "did
  // every literal survive" reports those as losses -- which is the same
  // over-eager mistake this whole file exists about, made one level up.
  //
  // What the old stripper could break is precisely a literal containing a
  // comment opener. Length is preserved, so a literal's position in the source
  // is its position in the stripped text: if the same characters are still
  // there, it survived, and if they are spaces it was blanked.
  const lost = [];
  const checked = [];
  for (const file of files) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    const stripped = stripSql(src);
    for (const match of src.matchAll(/'(?:[^'\n]|'')*'/g)) {
      const literal = match[0];
      if (!/--|\/\*/.test(literal)) continue;
      checked.push(`${file}: ${literal.slice(0, 30)}`);
      if (stripped.slice(match.index, match.index + literal.length) !== literal) {
        lost.push(`${file}: ${literal.slice(0, 40)}`);
      }
    }
  }
  ok(checked.length > 0,
     `some migration really does put a comment opener inside a string (${checked.length} of them)`);
  ok(lost.length === 0,
     `and none of them is eaten by the stripper (${lost.slice(0, 2).join(' | ') || 'none lost'})`);
}

// ---------------------------------------------------------------------------
// 5. AND THE COPIES ONLY GO DOWN
// ---------------------------------------------------------------------------
//
// A RATCHET RATHER THAN A SWEEP. Forty-two test files still carry their own
// pasted stripper. Rewriting all of them in one go is a large mechanical change
// to forty-two working checks for a fault that can only bite the handful whose
// SQL puts a comment opener inside a string -- so they get migrated when they
// are next touched, and the fixed one stays fixed.
//
// What this number stops is the thing that actually caused the problem: the
// next person needing a stripper, not finding one, and pasting a forty-third
// copy of the broken line. If this fails because the count went UP, import
// tests/_strip.mjs instead of pasting. If it fails because the count went DOWN,
// lower the number and take the win.
{
  const local = fs.readdirSync(path.join(root, 'tests'))
    .filter((f) => f.endsWith('.mjs'))
    .filter((f) => /const (stripSql|stripTs|strip) = \(src\) =>/
      .test(fs.readFileSync(path.join(root, 'tests', f), 'utf8')));

  ok(local.length <= 42,
     `no new file pastes its own stripper (${local.length} still carry one, was 42)`);
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);

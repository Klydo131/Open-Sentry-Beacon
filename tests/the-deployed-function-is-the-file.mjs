// What runs at Supabase is this directory, byte for byte.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS, AND IT IS NOT A TIDY-UP.
//
// The invite edge function is the only code in this project that does not reach
// production through git. Vercel builds the app from `main`; the edge function
// is deployed by SENDING ITS SOURCE INLINE, as JSON, in a tool call. Nothing
// about that path is checked by the build, by CI, or by any other file here.
//
// Two separate things have already gone wrong on it, and both were invisible
// from inside the repository:
//
//   1. A PLACEHOLDER WAS DEPLOYED BY MISTAKE. `// PLACEHOLDER` went live as
//      version 39 in place of forty thousand characters of index.ts. Every
//      invitation the church sent in that window failed. The repo was perfect
//      throughout; `npm run verify` was green throughout. Nothing in the
//      project could have told anybody.
//
//   2. THE TRANSPORT REWRITES THE SOURCE. Sending the files as JSON means a
//      JSON parser reads them, and a JSON parser DECODES BACKSLASH-U ESCAPES.
//      One escape in email.ts arrived at Supabase as the bare character it
//      stands for, and the deployed file was five characters shorter than the
//      file it came from.
//
// The second one was harmless where it landed -- the escape and the character
// are the same thing inside that character class. It is not harmless in
// general, and this is the case to keep in mind: an escape for a full stop
// inside a regular expression arrives as a bare dot, which matches ANY
// character. A pattern written to be strict is deployed permissive, the source
// still reads correctly, and there is nothing to see.
//
// So this file does the half that can be done offline: it forbids the escape,
// so the transport has nothing left to rewrite and the deployed bytes are the
// file's bytes.
//
// WHAT THIS FILE CANNOT DO, SAID PLAINLY. It cannot see Supabase. A guardrail
// that runs in CI has no credentials and no network, so it cannot fetch the
// live function and compare. The comparison is real and it is what caught both
// faults, but it is a THING A PERSON RUNS, not a check that can go red on its
// own. `npm run verify` passing therefore never means "the deployed function is
// correct" -- it means "if it was deployed from these files, it is these
// files". The procedure for the other half is at the bottom of this file.
//
//   node tests/the-deployed-function-is-the-file.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'supabase/functions/invite';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

/** Every file that is actually sent when this function is deployed. */
function deployed() {
  return fs.readdirSync(path.join(root, DIR))
    .filter((f) => f.endsWith('.ts'))
    .sort();
}

// ---------------------------------------------------------------------------
// 1. THE FUNCTION IS STILL THREE FILES
// ---------------------------------------------------------------------------
//
// Named rather than counted. A deploy sends a LIST, and a file added here but
// left off that list is not a build error -- it is an import of something that
// is not there, at runtime, on the first invitation somebody sends. So the
// three are written down, and adding a fourth has to be a deliberate edit to
// this line by somebody who has then also gone and looked at the deploy call.
{
  const files = deployed();
  const EXPECTED = ['email.ts', 'index.ts', 'password.ts'];
  ok(JSON.stringify(files) === JSON.stringify(EXPECTED),
     `the deploy sends exactly these files: ${EXPECTED.join(', ')}`
     + (JSON.stringify(files) === JSON.stringify(EXPECTED)
        ? '' : `\n        found instead: ${files.join(', ') || '(nothing)'}`));

  ok(files.includes('index.ts'),
     'and index.ts, the entrypoint, is one of them');
}

// ---------------------------------------------------------------------------
// 2. NOTHING IN THE DIRECTORY SURVIVES THE TRIP AS SOMETHING ELSE
// ---------------------------------------------------------------------------
//
// THE ONE RULE THIS FILE EXISTS FOR.
//
// A backslash-u escape is decoded by the JSON transport, so what is deployed is
// the character, not the escape. Write the character.
//
// This check must name the pattern to hunt for it, so it exempts itself -- the
// same exemption tests/no-backend.js takes, in its own words: "it must name
// them to find them". The exemption is by path, so it cannot silently widen.
{
  const ESCAPE = /\\u\{?[0-9a-fA-F]{1,6}\}?/g;
  const offenders = [];

  for (const file of deployed()) {
    const text = fs.readFileSync(path.join(root, DIR, file), 'utf8');
    const hits = text.match(ESCAPE) ?? [];
    if (hits.length) {
      // The line numbers, because "email.ts has one" is not enough to go and
      // fix it and this check is read at the moment somebody is in a hurry.
      const lines = text.split('\n')
        .map((l, i) => (ESCAPE.test(l) ? i + 1 : null))
        .filter(Boolean);
      ESCAPE.lastIndex = 0;
      offenders.push(`${file} line ${lines.join(', ')} (${hits.join(' ')})`);
    }
  }

  ok(offenders.length === 0,
     'no backslash-u escape in the deployed source, so the transport has '
     + 'nothing to decode'
     + (offenders.length
        ? `\n        write the character itself instead, in: ${
            offenders.join('\n                                              ')}`
        : ''));
}

// ---------------------------------------------------------------------------
// 3. AND THE REASON IS WRITTEN DOWN WHERE IT WILL BE READ
// ---------------------------------------------------------------------------
//
// Check 2 goes red with a message, and a message is not a reason. Somebody
// meeting this for the first time will be holding a perfectly ordinary escape
// and a build that refuses it, and the honest question is "why on earth not".
// The answer belongs beside the line it constrains, not only in a test file
// they have no reason to open -- so email.ts carrying its own explanation is
// itself checked.
//
// DELETING THE EXPLANATION IS THE FAILURE THIS CATCHES. Not a missing word.
{
  const email = fs.readFileSync(path.join(root, DIR, 'email.ts'), 'utf8');
  ok(/BACKSLASH-U ESCAPES/.test(email),
     'email.ts says why its apostrophe is written as itself');
  ok(/JSON/.test(email) && /decode/i.test(email),
     'and names the transport that would have rewritten it');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);

// ---------------------------------------------------------------------------
// THE OTHER HALF: COMPARING THE LIVE FUNCTION TO THIS DIRECTORY
// ---------------------------------------------------------------------------
//
// This cannot run here -- no credentials, no network. It is the check that
// caught the placeholder and the rewritten escape, so it is written down rather
// than remembered. RUN IT AFTER EVERY DEPLOY, without exception, because a
// deploy is the one change in this project that no automated gate can see.
//
//   1. Fetch the live function's files (Supabase MCP: get_edge_function, or
//      `supabase functions download invite`).
//   2. For each of the three, compare the live text to the file here. NOT a
//      length check and NOT a spot-read: sha256 both, or diff them.
//   3. Check the version number moved, and that the status is ACTIVE.
//
// A deploy that reports success has reported that the REQUEST was accepted. It
// has not told you what was in it. Version 39 returned success.
//
// TWO WAYS TO COMPARE, AND THE DIFFERENCE MATTERS. Raw equality is the goal and
// the sharper tool. But when it reports a difference, strip comments from both
// sides and compare again before treating it as an emergency: code that differs
// is an outage waiting to happen, while comments that differ mean only that the
// deployed copy is behind on prose.
//
// KNOWN STATE AT THE TIME OF WRITING, so the next person is not misled by a
// diff that is expected. Live version 40 runs this directory's code exactly --
// all three files match with comments stripped. The raw bytes of email.ts do
// NOT match, because the comment above the greeting-name pattern was written
// AFTER version 40 went out, explaining a fault found by comparing against it.
//
// It was left that way deliberately. There is no access token in the
// development sandbox, so `supabase functions deploy` cannot run there and the
// only route is sending all three files inline, by hand -- seventy thousand
// characters, which is how the placeholder got sent in the first place. Doing
// that again to synchronise a comment would risk a real outage to change
// nothing that runs. The next change to the CODE goes out and gets diffed, and
// the comment rides along with it.
// ---------------------------------------------------------------------------

process.exit(bad === 0 ? 0 : 1);

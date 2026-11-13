// Reading a list of people out of a file.
//
// WHY THIS IS TESTED AND THE REST OF THE PANEL IS NOT. Everything else in bulk
// invitation is a loop over a call that is already covered. This function is
// the part where a mistake is silent AND expensive: it decides who gets an
// email, what name greets them, and now WHICH ROLE they are given. A parser
// that drops a line invites twenty-four of twenty-five and nobody notices the
// missing one; a parser that keeps a duplicate sends somebody two invitations,
// which switches off the first and produces exactly the  report that cost a week earlier; and a parser that reads the role
// column wrong hands somebody the wrong authority in a church.
//
// THE BUG THE ROW READING EXISTS FOR. The old reader split on commas BEFORE it
// split on lines, so `Maria Santos, maria@example.org, Explorer` came apart
// into three fragments and produced one invitation and two warnings. A file
// that said exactly who everybody was was the input it handled worst.
//
// It is transpiled and RUN, not read. Checking the source for the word
// "duplicate" proves nothing about what comes out.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const SRC = 'components/LiveBulkInvite.tsx';
const src = readFileSync(SRC, 'utf8');

// Between the two markers is everything the parser needs and nothing that
// imports, which is what makes it runnable here. The markers are checked
// because a rename that moved the block would otherwise leave this file
// testing an empty string and reporting all clear.
const start = src.indexOf('// PARSER BEGINS HERE');
const end = src.indexOf('// PARSER ENDS HERE');
ok(start !== -1 && end > start, 'the parser is where this test expects it');

const js = ts.transpileModule(
  src.slice(start, end).replace('export function', 'function')
    + '\nmodule.exports = { parseInviteList, splitFields, NOT_TEXT };',
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { parseInviteList, splitFields, NOT_TEXT } = mod.exports;

const sendable = (rows) => rows.filter((r) => !r.problem && !r.heading);
const emails = (rows) => sendable(rows).map((r) => r.email);

// --- THE THING THAT WAS ASKED FOR: NAME, EMAIL, ROLE ------------------------
{
  const rows = parseInviteList(
    'Maria Santos, maria@example.org, Explorer\n'
    + 'Joel Reyes, joel@example.org, Guide\n'
    + 'Ana Cruz, ana@example.org, Director',
  );
  ok(sendable(rows).length === 3, 'three rows of three columns are three people');
  ok(rows[0].name === 'Maria Santos', 'the name comes off the row, which is what the greeting uses');
  ok(rows[0].email === 'maria@example.org', 'and so does the address');
  ok(rows[0].role === 'ds', 'Explorer is read as the Explorer role');
  ok(rows[1].role === 'dm', 'Guide is read as the Guide role');
  ok(rows[2].role === 'admin', 'Director is read as the Director role');
}
{
  // The exact failure the rewrite exists for, stated as a test so it cannot
  // come back: one row, one person, not three fragments.
  const rows = parseInviteList('Maria Santos, maria@example.org, Explorer');
  ok(rows.length === 1, 'a three-column row is ONE person, not three fragments');
}

// --- FIELD ORDER, because an exported file rarely has the order you expect --
{
  const rows = parseInviteList('maria@example.org, Maria Santos, Explorer');
  ok(rows[0].name === 'Maria Santos' && rows[0].role === 'ds',
     'email first still finds the name and the role');
}
{
  const rows = parseInviteList('Maria Santos, Explorer, maria@example.org');
  ok(rows[0].name === 'Maria Santos' && rows[0].role === 'ds',
     'and so does the role in the middle');
}

// --- A COMMA INSIDE A NAME, which a comma-separated file has to survive -----
{
  const rows = parseInviteList('"Santos, Maria", maria@example.org, Explorer');
  ok(rows.length === 1, 'a quoted name does not split the row in half');
  ok(rows[0].name === 'Santos, Maria', 'and the comma stays inside the name');
}
{
  ok(splitFields('a,b;c\td').join('|') === 'a|b|c|d',
     'commas, semicolons and tabs all separate fields');
}

// --- TABS, which is what a spreadsheet gives you when you copy three columns
{
  const rows = parseInviteList('Maria Santos\tmaria@example.org\tExplorer');
  ok(rows[0].name === 'Maria Santos' && rows[0].role === 'ds',
     'a tab-separated row reads the same as a comma-separated one');
}

// --- THE HEADER ROW an exported file brings with it -------------------------
{
  const rows = parseInviteList('Name,Email,Role\nMaria Santos,maria@example.org,Explorer');
  ok(rows[0].heading === true, 'a row of column headings is marked as headings');
  ok(sendable(rows).length === 1, 'and is not counted as somebody to invite');
  ok(rows.length === 2, 'but it is still shown, rather than vanishing from the count');
}
{
  // The looseness that would eat a real person. A first row with no email
  // column in it is not a header, whatever else it says.
  const rows = parseInviteList('Maria Santos,maria@example.org,Explorer');
  ok(rows[0].heading !== true, 'a first row with an address in it is never a header');
}

// --- A ROW THAT NAMES NO ROLE takes the one from the picker -----------------
{
  const rows = parseInviteList('Maria Santos, maria@example.org');
  ok(rows[0].role === null, 'a row with no role says so, rather than guessing one');
  ok(rows[0].problem === '', 'and is still perfectly sendable');
}
{
  // A word that is not a role must not become one. It is left null, the picker
  // supplies the role, and the preview shows which role that is.
  const rows = parseInviteList('Maria Santos, maria@example.org, Deacon');
  ok(rows[0].role === null, 'an unrecognised word is not turned into a role');
  ok(rows[0].name === 'Maria Santos', 'and the name is still read');
}

// --- A ROLE THE INVITER MAY NOT HAND OUT IS REFUSED, NOT LOWERED ------------
//
// A Director may invite Guides and Explorers. Quietly turning their
// "Executive Director" row into an Explorer would be a lie they only find out
// about from the person they invited.
{
  const rows = parseInviteList(
    'Ada Lim, ada@example.org, Executive Director',
    ['dm', 'ds'],
  );
  ok(rows[0].problem !== '', 'a role beyond the inviter is refused');
  ok(/Executive Director/.test(rows[0].problem),
     'and the refusal quotes the word from the file');
  ok(sendable(rows).length === 0, 'so nothing is sent for that row');
  // The second layer, and it is the one that matters if the first is ever
  // loosened: the role is not merely refused, it is not CARRIED. A refused row
  // that still held 'executive' would escalate the moment somebody stopped
  // reading `problem` before sending.
  ok(rows[0].role === null, 'and the refused role is not carried on the row either');
}
{
  const rows = parseInviteList(
    'Ada Lim, ada@example.org, Guide',
    ['dm', 'ds'],
  );
  ok(rows[0].role === 'dm' && rows[0].problem === '',
     'a role within the inviter goes through');
}

// --- EVERYTHING THAT USED TO WORK STILL WORKS -------------------------------
{
  const rows = parseInviteList('a@example.org\nb@example.org\nc@example.org');
  ok(emails(rows).join(',') === 'a@example.org,b@example.org,c@example.org',
     'one address per line');
}
{
  const rows = parseInviteList('a@example.org, b@example.org; c@example.org');
  ok(emails(rows).length === 3, 'several addresses on ONE line are still a list of three');
}
{
  const rows = parseInviteList('Maria Santos <maria@example.org>\nJoe <joe@example.org>');
  ok(emails(rows).join(',') === 'maria@example.org,joe@example.org',
     'Name <address> yields the address');
  ok(rows[0].name === 'Maria Santos', 'and keeps the name for the greeting');
}
{
  const rows = parseInviteList('a@example.org\tb@example.org');
  ok(emails(rows).length === 2, 'a pasted spreadsheet column of addresses still works');
}

// --- CASE AND WHITESPACE, which is how one person becomes two ---------------
{
  const rows = parseInviteList('  Ruth@Example.ORG  ');
  ok(emails(rows)[0] === 'ruth@example.org', 'addresses are trimmed and lower-cased');
}
{
  const rows = parseInviteList('ruth@example.org\nRUTH@example.org');
  ok(emails(rows).length === 1, 'the same address in two cases is ONE invitation');
  ok(rows[1].problem === 'Listed twice', 'and the second line says why it was skipped');
}
{
  // The duplicate has to be caught across rows that look nothing alike.
  const rows = parseInviteList('Maria Santos, maria@example.org, Explorer\nmaria@example.org');
  ok(emails(rows).length === 1, 'a row and a bare address for one person is one invitation');
}

// --- what must never reach a send -------------------------------------------
{
  const rows = parseInviteList('not an address\nreal@example.org\n\n   \nalso-bad@\n@nope.example');
  ok(emails(rows).join(',') === 'real@example.org', 'only the real address is sendable');
  ok(rows.every((r) => r.problem || r.email === 'real@example.org'),
     'and every skipped line carries a reason rather than vanishing');
  // A dropped line is worse than a rejected one: nobody counts the ones that
  // are not there.
  ok(rows.length === 4, 'blank lines collapse but nothing else is silently dropped');
}
{
  ok(parseInviteList('').length === 0, 'empty input yields nothing rather than one blank row');
  ok(parseInviteList('   \n  \n').length === 0, 'and so does whitespace');
}
{
  // Windows line endings, which is what a file saved on a church laptop has.
  // The bare-address form is the one that actually catches this: a stray
  // carriage return on the end of an ADDRESS stops it looking like an address
  // at all, and that whole line goes unsent. On a three-column row the return
  // lands on the role instead, where it does no visible harm, which is why
  // that case alone would have proved nothing.
  const list = parseInviteList('a@example.org\r\nb@example.org');
  ok(emails(list).join(',') === 'a@example.org,b@example.org',
     'a file saved on Windows does not lose every address to a carriage return');
  const rows = parseInviteList('Maria Santos,maria@example.org,Explorer\r\nJoel,joel@example.org,Guide');
  ok(sendable(rows).length === 2 && rows[0].role === 'ds',
     'and its three-column rows read the same as any other');
}

// --- THE FILES THIS CANNOT READ, AND SAYS SO --------------------------------
//
// A .docx is a zip archive. Reading one as text produces a screen of rubbish
// and a list of warnings that blames the person rather than the format.
{
  for (const name of ['members.docx', 'List.XLSX', 'roster.pdf', 'people.numbers', 'x.pages']) {
    ok(NOT_TEXT.test(name), `${name} is refused with an explanation rather than read as text`);
  }
  for (const name of ['members.csv', 'members.tsv', 'members.txt', 'MEMBERS.CSV']) {
    ok(!NOT_TEXT.test(name), `${name} is read`);
  }
}

// --- AND THE SCREEN ACTUALLY USES ALL OF IT ---------------------------------
//
// The parser being right is no help if the panel never calls it with the roles
// it is allowed to hand out, never reads a file, or sends every row as the one
// role in the picker. Each of these is a line that, deleted, leaves every
// assertion above passing and the feature gone.
{
  ok(/type="file"/.test(src) && /accept="[^"]*\.csv/.test(src),
     'the panel offers a file to choose');
  ok(/await file\.text\(\)/.test(src), 'and reads it as text');
  ok(/onDrop=/.test(src) && /dataTransfer\.files/.test(src),
     'and a file can be dropped on it');
  ok(/parseInviteList\(text, roles\)/.test(src) && /parseInviteList\(raw, roles\)/.test(src),
     'the parser is told which roles this Director may hand out');
  ok(/role: roleFor\(each\)/.test(src),
     'and each invitation is sent with THAT ROW\'S role, not one role for the batch');
  ok(/roleFor = \(row: Parsed\): Role => row\.role \?\? role/.test(src),
     'a row with no role of its own falls back to the picker');
  ok(/roleNoun\(roleFor\(p\)\)/.test(src),
     'and the preview names the role every row will be sent as');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);

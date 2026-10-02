// A document that is printed and handed to somebody has to render.
//
// THE BUG THIS EXISTS FOR. The PDF builder ran its inline pass over the FIRST
// LINE of a list item and no further, so a bold phrase that wrapped inside a
// bullet came out with its asterisks still in it:
//
//     ... and choose **Pause
//     project**.
//
// in print, in a document whose whole purpose is that somebody reads it and
// does what it says. Paragraphs had been joined before the inline pass for as
// long as the builder has existed; list items had not, and the handbook happens
// never to wrap a bold phrase inside a bullet, so nothing caught it. Two newer
// documents did, and both went out looking like that.
//
// This renders every document that gets printed and looks at the result, which
// is the only way to catch a class of bug that lives between the Markdown and
// the page.
//
// PICTURES TOO, since 2 October 2026, when the handbook got its screenshots.
// The builder drops an image it cannot find and carries on, on purpose, so a
// guide with one shot not yet taken still builds. The cost is that a renamed
// screenshot disappears from the printed copy with nothing but a line on
// stderr that nobody reads. So every picture a printed document names must be
// in the repository, and must come out of the render as a picture.

import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// The documents that are built into PDFs and handed to people.
const PRINTED = ['HANDBOOK.md', 'HOW-TO-USE.md', 'WHAT-IT-COSTS.md', 'DATA-PROTECTION.md', 'DO-THIS-NEXT.md'];

// The builder's own renderer, used rather than reimplemented: a second copy of
// the rules would drift from the first and then this would be checking a
// document nobody prints.
const source = readFileSync('docs/handbook/build-pdf.js', 'utf8');
const start = source.indexOf('function render(');
ok(start > -1, 'the builder has a render function to borrow');

const dir = mkdtempSync(path.join(tmpdir(), 'beacon-render-'));
const shim = path.join(dir, 'render.cjs');
const end = source.indexOf('\nconst page =');
readFileSync;
try {
  const body = source.slice(0, end);
  // The builder is a script; take everything above the part that goes looking
  // for a browser and export what is needed.
  const escaped = body.replace(/^#!.*\n/, '');
  // The shim lives in a temporary folder, so it is told where docs/ really is;
  // otherwise every picture would be "missing" and the checks below would be
  // checking nothing.
  const DOCS_LINE = "const DOCS = path.join(__dirname, '..');";
  ok(escaped.includes(DOCS_LINE), 'the builder finds pictures relative to docs/');
  const located = escaped.replace(DOCS_LINE, `const DOCS = ${JSON.stringify(path.resolve('docs'))};`);
  const wrapper = `${located}\nmodule.exports = { render, inline, escapeHtml };\n`;
  const fs = await import('node:fs');
  fs.writeFileSync(shim, wrapper);

  const { render } = await import(`file://${shim}`).then((m) => m.default ?? m);

  for (const doc of PRINTED) {
    const file = path.join('docs', doc);
    if (!existsSync(file)) { ok(false, `${doc} is missing`); continue; }
    const html = render(readFileSync(file, 'utf8'));

    // 1. No Markdown left in the output. Asterisks, backticks and heading
    //    marks that survived the render are all the same failure.
    const leaked = (html.match(/\*\*/g) ?? []).length;
    ok(leaked === 0, `${doc}: no bold markers left in the page (${leaked})`);

    // 2. Tables come out balanced. A row with the wrong number of cells is a
    //    table that renders crooked, which nobody notices in Markdown.
    let crooked = 0;
    for (const table of html.match(/<table>[\s\S]*?<\/table>/g) ?? []) {
      const head = (table.match(/<th>/g) ?? []).length;
      for (const row of table.match(/<tr>(?!.*<th>)[\s\S]*?<\/tr>/g) ?? []) {
        const cells = (row.match(/<td>/g) ?? []).length;
        if (cells !== 0 && cells !== head) crooked += 1;
      }
    }
    ok(crooked === 0, `${doc}: every table row has as many cells as its heading`);

    // 3. It produced something. A renderer that returns nothing passes every
    //    check above.
    ok(html.length > 2000, `${doc}: rendered to a real page (${Math.round(html.length / 1024)} kB)`);

    // 4. Every picture is there, local, and printed. A caption is put into an
    //    attribute and then through the bold and italic pass, so a quote mark,
    //    an asterisk or a backtick in one breaks the page around it.
    const markdown = readFileSync(file, 'utf8');
    const pictures = [...markdown.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)].map((m) => ({ alt: m[1], src: m[2] }));
    if (!pictures.length) continue;
    const absent = pictures.filter((p) => /^https?:/i.test(p.src) || !existsSync(path.join('docs', p.src)));
    ok(absent.length === 0,
       `${doc}: all ${pictures.length} pictures are files in docs/${absent.length ? ` (not: ${absent.map((p) => p.src).join(', ')})` : ''}`);
    const awkward = pictures.filter((p) => /["*`]/.test(p.alt) || !p.alt.trim());
    ok(awkward.length === 0,
       `${doc}: every picture has a caption, with no quote mark, asterisk or backtick in it${awkward.length ? ` (${awkward.map((p) => p.src).join(', ')})` : ''}`);
    const printed = (html.match(/<figure[ >]/g) ?? []).length;
    ok(printed === pictures.length, `${doc}: every picture comes out as a figure (${printed} of ${pictures.length})`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);

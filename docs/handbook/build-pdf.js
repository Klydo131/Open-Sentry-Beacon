#!/usr/bin/env node
// Turn a Markdown document in docs/ into a printable PDF.
//
// ONE SOURCE, TWO OUTPUTS. The PDF people hand round at a demo and the document
// people read on GitHub are the same file. There is no separate PDF to fall out
// of date, because there is no separate PDF — this renders the Markdown that is
// already in the repository.
//
// Deliberately dependency-free. It uses the Chromium that Playwright already
// installs, through its own --print-to-pdf flag, so `node docs/handbook/build-pdf.js`
// works in a fresh clone with nothing but `npm install` behind it. A Markdown
// library and a PDF library would be two more things to keep current for a file
// that is generated a few times a year.
//
//   node docs/handbook/build-pdf.js                  # START-HERE.md
//   node docs/handbook/build-pdf.js SETUP.md SECURITY.md
//   node docs/handbook/build-pdf.js --combine "IT and AI Guide" A.md B.md
//
// Output lands in docs/handbook/pdf/.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DOCS = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'pdf');

// ---------------------------------------------------------------------------
// Finding a browser
// ---------------------------------------------------------------------------
// Checked in order of how likely each is to be the one the reader has. The
// error at the end names every place that was looked in, because "browser not
// found" without a list is a message that cannot be acted on.
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);

  // Playwright's own download, whose directory carries a version number.
  const pwRoot = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const entry of fs.readdirSync(pwRoot)) {
      if (!entry.startsWith('chromium-')) continue;
      candidates.push(
        path.join(pwRoot, entry, 'chrome-linux', 'chrome'),
        path.join(pwRoot, entry, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      );
    }
  } catch { /* no Playwright install; the plain paths above may still hit */ }

  for (const candidate of candidates) {
    try { if (fs.statSync(candidate).isFile()) return candidate; } catch { /* next */ }
  }
  throw new Error(
    'No Chrome or Chromium found. Set CHROME_PATH to one, or run '
    + '`npx playwright install chromium`. Looked in:\n  ' + candidates.join('\n  '),
  );
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------
// Enough of the language for the documents in this repository: headings,
// tables, fenced code, blockquotes, lists, links, bold, italic and inline code.
// It is not a general Markdown implementation and does not pretend to be.
const escapeHtml = (text) => text
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Inline formatting. Code spans are extracted FIRST and put back LAST, so that
// `**not bold**` inside backticks stays literal — otherwise every code sample
// containing an asterisk quietly changes meaning.
function inline(text) {
  const codes = [];
  let out = text.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = escapeHtml(out);
  // IMAGES BEFORE LINKS, and that order is not stylistic. `![alt](src)` is a
  // link pattern with a `!` in front of it, so the link rule matches it first
  // and turns every screenshot in the document into the literal text `!` next
  // to a hyperlink. The first version of this builder did exactly that, which
  // is why the guides had no pictures in them.
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    const embedded = embed(src);
    if (!embedded) return '';  // a missing image is worse as a broken icon
    // A phone screenshot is printed at the size of a phone, not the width of
    // the page: full width, a 390-pixel screen would be a page and a half tall.
    const { width, height } = pngSize(src);
    const shape = height > width * 1.4 ? ' class="phone"' : '';
    return `<figure${shape}><img src="${embedded}" alt="${alt}">`
      + (alt ? `<figcaption>${alt}</figcaption>` : '')
      + '</figure>';
  });
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) =>
    `<a href="${absolute(href)}">${label}</a>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[i])}</code>`);
}

const slug = (text) => text.toLowerCase()
  .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

// Where the docs live, for turning a relative link into one that works.
const REPO_DOCS = 'https://github.com/klydo131/open-sentry-beacon/blob/main/docs/';

/**
 * Make a link work from inside a PDF.
 *
 * THE BUG THIS FIXES. The Markdown says `[START-HERE.md](START-HERE.md)`, which
 * is correct on GitHub — same directory, resolves fine. Inside a PDF it is
 * resolved against wherever the reader saved the file, so it points at a
 * document that is not there and the browser says "File not found". Every
 * cross-reference in every guide was dead the moment the PDF left this folder,
 * which is a hard thing to discover if you only ever read the Markdown.
 *
 * In-page anchors (#part-3) are left exactly as they are: those resolve inside
 * the PDF itself, and rewriting them would break the contents table, which is
 * the one set of links that WAS working.
 */
/**
 * Read an image off disk and return it as a data: URI.
 *
 * INLINED RATHER THAN LINKED, because the PDF has to survive being emailed.
 * Chrome resolves a relative <img src> against the temporary HTML file, which
 * works here and produces a document that silently loses every picture the
 * moment it is moved — and the whole point of these is being handed to somebody
 * on a memory stick.
 *
 * Returns '' for anything missing rather than throwing. A guide with one
 * screenshot not yet captured should still build; the warning says which.
 */
/** A PNG's width and height, read from its header; 0 x 0 for anything else. */
function pngSize(src) {
  try {
    const head = Buffer.alloc(24);
    const fd = fs.openSync(path.resolve(DOCS, src), 'r');
    fs.readSync(fd, head, 0, 24, 0);
    fs.closeSync(fd);
    if (head.toString('ascii', 12, 16) !== 'IHDR') return { width: 0, height: 0 };
    return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
  } catch {
    return { width: 0, height: 0 };
  }
}

function embed(src) {
  if (/^data:/i.test(src)) return src;
  if (/^https?:/i.test(src)) {
    // Nothing is fetched at build time: an image that needs the network is an
    // image the reader will not have either.
    console.error(`  ! skipped remote image ${src} — inline it in docs/ instead`);
    return '';
  }
  const file = path.resolve(DOCS, src);
  if (!fs.existsSync(file)) {
    console.error(`  ! missing image ${src}`);
    return '';
  }
  const types = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  };
  const type = types[path.extname(file).toLowerCase()];
  if (!type) {
    console.error(`  ! unsupported image type ${src}`);
    return '';
  }
  return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
}

function absolute(href) {
  if (/^(https?:|mailto:|#)/i.test(href)) return href;
  const [file, anchor] = href.split('#');
  if (/\.md$/i.test(file)) {
    return REPO_DOCS + file + (anchor ? `#${anchor}` : '');
  }
  return href;
}

function render(markdown) {
  const lines = markdown.split('\n');
  const html = [];
  let i = 0;

  const closeList = (state) => { if (state.open) { html.push(`</${state.open}>`); state.open = null; } };
  const list = { open: null };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code. Taken verbatim — no inline processing inside.
    if (/^```/.test(line)) {
      closeList(list);
      const body = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i += 1;
      html.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    // Tables: a header row, a divider of dashes, then rows.
    if (/^\|/.test(line) && /^\|[\s:|-]+\|$/.test(lines[i + 1] || '')) {
      closeList(list);
      const cells = (row) => row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\|/.test(lines[i])) body.push(cells(lines[i++]));
      html.push('<table><thead><tr>'
        + head.map((c) => `<th>${inline(c)}</th>`).join('')
        + '</tr></thead><tbody>'
        + body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('')
        + '</tbody></table>');
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList(list);
      const level = heading[1].length;
      html.push(`<h${level} id="${slug(heading[2])}">${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeList(list);
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      html.push(`<blockquote>${render(body.join('\n'))}</blockquote>`);
      continue;
    }

    if (/^---+$/.test(line)) { closeList(list); html.push('<hr>'); i += 1; continue; }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (bullet || numbered) {
      const want = bullet ? 'ul' : 'ol';
      if (list.open !== want) { closeList(list); html.push(`<${want}>`); list.open = want; }

      // A LIST ITEM CAN RUN OVER SEVERAL LINES, and this used to render only
      // the first of them through the inline pass. So `**Pause` on one line and
      // `project**` on the next came out with the asterisks still in it, in
      // print, where the whole point of the document is that somebody reads it.
      //
      // Paragraphs had always been joined before the inline pass a few lines
      // below; list items had not, and nobody noticed because the handbook
      // happens never to wrap a bold phrase inside a bullet. Two of the newer
      // documents did, and it went out looking like that.
      //
      // A continuation line is an indented line that is not itself a new item
      // and not a blank, which is what Markdown means by one.
      const parts = [(bullet || numbered)[1]];
      i += 1;
      while (
        i < lines.length
        && lines[i].trim()
        && /^\s+\S/.test(lines[i])
        && !/^\s*([-*]\s|\d+\.\s)/.test(lines[i])
      ) {
        parts.push(lines[i].trim());
        i += 1;
      }
      html.push(`<li>${inline(parts.join(' '))}</li>`);
      continue;
    }

    if (!line.trim()) { closeList(list); i += 1; continue; }

    closeList(list);
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^([#>|`-]|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])) {
      para.push(lines[i++]);
    }
    // A paragraph that is nothing but pictures is a row of them, side by side:
    // two phone screens next to each other read as "this, then this". A figure
    // inside a <p> is not allowed anyway, and Chrome would close the <p> early.
    const pictures = para.length && para.every((l) => /^!\[[^\]]*\]\([^)]+\)\s*$/.test(l.trim()));
    if (pictures) html.push(`<div class="figures">${para.map((l) => inline(l.trim())).join('')}</div>`);
    else if (para.length) html.push(`<p>${inline(para.join(' '))}</p>`);
    else i += 1;
  }
  closeList(list);
  return html.join('\n');
}

// Printed, not screen-read: serif body for long prose, page breaks kept out of
// the middle of headings and tables, and links shown in full because a PDF
// reader cannot hover over one.
const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font: 10.5pt/1.55 Georgia, 'Times New Roman', serif; color: #1a1a1a; }
  h1 { font-size: 24pt; margin: 0 0 4pt; color: #0b1f3a; page-break-after: avoid; }
  h2 { font-size: 15pt; margin: 20pt 0 6pt; color: #0b1f3a;
       border-bottom: 1.5pt solid #c9a227; padding-bottom: 3pt;
       page-break-after: avoid; page-break-before: auto; }
  h3 { font-size: 12pt; margin: 14pt 0 4pt; color: #0b1f3a; page-break-after: avoid; }
  h4 { font-size: 10.5pt; margin: 10pt 0 3pt; page-break-after: avoid; }
  h5 { font-size: 10.5pt; font-style: italic; margin: 8pt 0 2pt; color: #0b1f3a; page-break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  ul, ol { margin: 6pt 0 6pt 18pt; padding: 0; }
  li { margin: 2.5pt 0; }
  code { font: 9pt/1.4 'SF Mono', Menlo, Consolas, monospace;
         background: #f3f4f6; padding: 1pt 3pt; border-radius: 2pt; }
  pre { background: #0b1f3a; color: #f8fafc; padding: 9pt 11pt; border-radius: 4pt;
        overflow-wrap: break-word; white-space: pre-wrap; page-break-inside: avoid;
        margin: 8pt 0; }
  pre code { background: none; color: inherit; padding: 0; font-size: 8.5pt; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9.5pt;
          page-break-inside: avoid; }
  th { background: #0b1f3a; color: #fff; text-align: left; padding: 5pt 7pt; }
  td { border-bottom: 0.5pt solid #d1d5db; padding: 5pt 7pt; vertical-align: top; }
  blockquote { margin: 9pt 0; padding: 7pt 12pt; background: #fdf8e8;
               border-left: 3pt solid #c9a227; page-break-inside: avoid; }
  blockquote p { margin: 0 0 4pt; }
  blockquote p:last-child { margin-bottom: 0; }
  hr { border: none; border-top: 0.5pt solid #d1d5db; margin: 14pt 0; }
  a { color: #0b1f3a; text-decoration: none; border-bottom: 0.5pt solid #9ca3af; }
  /* A printed link nobody can click needs to show where it goes — but only for
     real destinations, not for the in-page contents table. */
  a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 7.5pt; color: #6b7280;
                           border: none; word-break: break-all; }
  strong { color: #0b1f3a; }
  /* A screenshot is evidence, so it gets a frame and stays with its caption.
     max-height keeps a tall screenshot from taking a whole page on its own,
     which is what pushes the step it illustrates onto the next one. */
  figure { margin: 12pt 0; text-align: center; page-break-inside: avoid; }
  figure img { max-width: 100%; max-height: 165mm; height: auto;
               border: 0.75pt solid #d1d5db; border-radius: 3pt; }
  figcaption { margin-top: 4pt; font-size: 8.5pt; color: #6b7280;
               font-style: italic; }
  /* A phone screen at about the size of a phone, with its caption no wider
     than the picture it describes. */
  figure.phone { width: 62mm; margin: 12pt auto; }
  figure.phone img { width: 100%; max-height: none; }
  .figures { display: flex; justify-content: center; align-items: flex-start;
             gap: 8mm; page-break-inside: avoid; }
  .figures figure.phone { margin: 12pt 0; }
</style></head><body>${body}</body></html>`;

// COMBINE MODE. `--combine <Output Name>` renders every remaining file into ONE
// pdf instead of one each.
//
// Why this rather than a new combined Markdown file: the IT guide and the AI
// guide are already written, already correct, and already read on GitHub. A
// third document that repeated them would be a third document to keep in step,
// and the one that fell behind would be the one printed and handed to a church.
// Concatenating at render time means there is nothing to drift.
const argv = process.argv.slice(2);
let combineName = '';
const combineAt = argv.indexOf('--combine');
if (combineAt !== -1) {
  combineName = argv[combineAt + 1] || 'Combined';
  argv.splice(combineAt, 2);
}
const files = argv.length ? argv : ['START-HERE.md'];
fs.mkdirSync(OUT, { recursive: true });
const chrome = findChrome();

if (combineName) {
  const parts = [];
  const contents = [];
  for (const name of files) {
    const source = path.join(DOCS, name);
    if (!fs.existsSync(source)) {
      console.error(`skipped ${name} — not found in docs/`);
      process.exitCode = 1;
      continue;
    }
    const markdown = fs.readFileSync(source, 'utf8');
    const title = (markdown.match(/^#\s+(.*)$/m) || [, name])[1];
    contents.push(title);
    // page-break-before on every part after the first, so a reader can find
    // where one guide ends and the next begins without hunting.
    parts.push(
      `<section class="doc"${parts.length ? ' style="page-break-before: always"' : ''}>`
      + render(markdown)
      + '</section>',
    );
  }

  const toc =
    '<section class="doc"><h1>' + combineName + '</h1>'
    + '<p><em>Open Sentry Beacon — one document, both halves: setting it up, and '
    + 'using an AI assistant to do the work. Generated from the Markdown in '
    + '<code>docs/</code>, so it cannot disagree with the repository.</em></p>'
    + '<h2>What is in here</h2><ol>'
    + contents.map((t) => `<li>${t}</li>`).join('')
    + '</ol></section>';

  const pdfPath = path.join(OUT, `Open-Sentry-Beacon-${combineName.replace(/[^\w-]+/g, '-')}.pdf`);
  const htmlPath = pdfPath.replace(/\.pdf$/, '.html');
  fs.writeFileSync(htmlPath, page(combineName, toc + parts.join('')));
  execFileSync(chrome, [
    '--headless', '--disable-gpu', '--no-sandbox',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    htmlPath,
  ], { stdio: 'pipe' });
  fs.unlinkSync(htmlPath);
  const kb = Math.round(fs.statSync(pdfPath).size / 1024);
  console.log(`${path.relative(process.cwd(), pdfPath)}  (${kb} KB, ${contents.length} documents)`);
  process.exit(process.exitCode || 0);
}

for (const name of files) {
  const source = path.join(DOCS, name);
  if (!fs.existsSync(source)) {
    console.error(`skipped ${name} — not found in docs/`);
    process.exitCode = 1;
    continue;
  }
  const markdown = fs.readFileSync(source, 'utf8');
  const title = (markdown.match(/^#\s+(.*)$/m) || [, name])[1];
  const base = name.replace(/\.md$/, '');
  const htmlPath = path.join(OUT, `${base}.html`);
  const pdfPath = path.join(OUT, `Open-Sentry-Beacon-${base}.pdf`);

  fs.writeFileSync(htmlPath, page(title, render(markdown)));
  execFileSync(chrome, [
    '--headless', '--disable-gpu', '--no-sandbox',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    htmlPath,
  ], { stdio: 'pipe' });
  fs.unlinkSync(htmlPath);

  const kb = Math.round(fs.statSync(pdfPath).size / 1024);
  console.log(`${path.relative(process.cwd(), pdfPath)}  (${kb} KB)`);
}

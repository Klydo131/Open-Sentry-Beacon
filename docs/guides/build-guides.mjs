#!/usr/bin/env node
// The two complete guides, as PDFs: one for using Hope Beacon, one for building
// it.
//
// ONE SOURCE, STILL. Nearly every page of both guides is a document that is
// already in docs/ and already read on GitHub; this lays them out as one book
// each, in an order that makes sense to read straight through, with the few
// chapters that only a book needs (an overview, reading paths, a code tour,
// recipes, a glossary) written beside them in docs/guides/using/ and
// docs/guides/building/. Nothing is copied, so nothing drifts: fix a document
// and the next build of the guide has the fix.
//
// THE PICTURES ARE TAKEN FROM THE APP, NOT KEPT FROM LAST TIME. The atlas of
// every screen reads docs/screenshots/complete/manifest-*.json, which
// scripts/complete-guide-shots.mjs writes after photographing every room and
// folder of the sample church, for every role, on a phone and a computer.
//
// THE CONTENTS HAVE REAL PAGE NUMBERS. Chromium cannot number a cross-reference
// itself, so the book is printed twice: the first print carries an invisible
// marker at every chapter, `pdftotext` finds the page each one landed on, and
// the second print fills those numbers in. The markers are absolutely
// positioned, so taking them out moves nothing.
//
//   node docs/guides/build-reference.mjs      # the generated reference chapters
//   node docs/guides/build-guides.mjs         # both guides
//   node docs/guides/build-guides.mjs using   # or one of them
//
// Needs Playwright's Chromium (as the browser walks do), `sharp` (installed
// with Next) to shrink the pictures, and poppler's pdftotext and pdfunite.
// Writes docs/Hope-Beacon-Complete-Guide-Using.pdf and
// docs/Hope-Beacon-Complete-Guide-Building.pdf.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { USING, BUILDING } from './books.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORK = path.join(ROOT, 'docs/guides/.build');
const SHOTS = path.join(ROOT, 'docs/screenshots/complete');
const REPO = 'https://github.com/Klydo131/Open-Sentry-Beacon';
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

for (const tool of ['pdftotext', 'pdfunite', 'pdfinfo']) {
  try { execFileSync(tool, ['-v'], { stdio: 'pipe' }); } catch (e) {
    if (e.code === 'ENOENT') {
      console.error(`${tool} not found. Install poppler (apt install poppler-utils, brew install poppler).`);
      process.exit(1);
    }
  }
}

// ------------------------------------------------------------ the edition ---
const today = new Date();
const EDITION = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
let COMMIT = '';
try { COMMIT = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { /* not a clone */ }

// --------------------------------------------------------------- pictures ---
// A phone screenshot is 780 pixels wide and is printed about 50 mm wide; a
// computer one is 1440 and printed at most 174 mm. Both are shrunk to what the
// page can show, so a 250-page guide stays small enough to send.
let sharp = null;
try { sharp = require('sharp'); } catch { console.warn('  ! sharp not installed: pictures go in at full size'); }

const pictures = new Map(); // absolute source -> { src (file URL), width, height, phone }

async function prepare(abs) {
  if (pictures.has(abs)) return pictures.get(abs);
  if (!fs.existsSync(abs)) { console.warn(`  ! missing picture ${rel(abs)}`); pictures.set(abs, null); return null; }
  let info = { file: abs, width: 0, height: 0 };
  if (sharp && /\.(png|jpe?g|webp)$/i.test(abs)) {
    const meta = await sharp(abs).metadata();
    const phone = meta.height > meta.width * 1.4;
    const width = Math.min(meta.width, phone ? 640 : 1280);
    const name = rel(abs).replace(/[^\w.-]+/g, '_').replace(/\.\w+$/, '') + (meta.hasAlpha ? '.png' : '.jpg');
    let out = path.join(WORK, 'img', name);
    // Already a JPEG no wider than it will print: use it as it is, rather than
    // compressing it a second time.
    if (meta.format === 'jpeg' && meta.width <= width) out = abs;
    else if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(abs).mtimeMs) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      let img = sharp(abs).resize({ width, withoutEnlargement: true });
      img = meta.hasAlpha ? img.png({ compressionLevel: 9, palette: true }) : img.jpeg({ quality: 70, mozjpeg: true });
      await img.toFile(out);
    }
    info = { file: out, width: meta.width, height: meta.height };
  } else if (sharp && /\.svg$/i.test(abs)) {
    const meta = await sharp(abs).metadata().catch(() => ({ width: 0, height: 0 }));
    info = { file: abs, width: meta.width || 0, height: meta.height || 0 };
  }
  const got = { src: pathToFileURL(info.file).href, width: info.width, height: info.height, phone: info.height > info.width * 1.4 };
  pictures.set(abs, got);
  return got;
}

// --------------------------------------------------------------- chapters ---
const isFence = (l) => /^\s*```/.test(l);
const headingOf = (l) => { const m = l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/); return m ? { level: m[1].length, text: m[2] } : null; };

/** The lines of a Markdown file with, for each, whether it sits inside a fence. */
function scan(text) {
  let fenced = false;
  return text.replace(/\r/g, '').split('\n').map((line) => {
    if (isFence(line)) { fenced = !fenced; return { line, fenced: true }; }
    return { line, fenced };
  });
}

const tidyTitle = (t) => t
  .replace(/^Part\s+\d+\s*[—–-]\s*/i, '')
  .replace(/^\d+\.\s+/, '')
  .replace(/^Appendix\s+[A-Z]\.\s*/i, '')
  .replace(/\s*\*\([^)]*\)\*\s*$/, '');

/**
 * One source: a whole file, or a slice of one.
 *   { file }                        the whole file; its first H1 is the title
 *   { file, section: /re/ }         from the heading that matches to the next
 *                                   heading at the same level or above
 *   { file, from: /re/, until: /re/ } from one heading up to another
 *   { file, intro: true }           what comes before the first H2
 */
function slice(spec) {
  const abs = path.join(ROOT, spec.file);
  const lines = scan(fs.readFileSync(abs, 'utf8'));
  let start = 0; let end = lines.length; let title = '';
  const find = (re, from = 0) => lines.findIndex((l, i) => i >= from && !l.fenced && headingOf(l.line) && re.test(headingOf(l.line).text));
  if (spec.section || spec.from) {
    start = find(spec.section || spec.from);
    if (start < 0) throw new Error(`${spec.file}: no heading matches ${spec.section || spec.from}`);
    const level = headingOf(lines[start].line).level;
    title = headingOf(lines[start].line).text;
    if (spec.until) {
      end = find(spec.until, start + 1);
      if (end < 0) throw new Error(`${spec.file}: no heading matches ${spec.until}`);
    } else {
      end = lines.findIndex((l, i) => i > start && !l.fenced && headingOf(l.line) && headingOf(l.line).level <= level);
      if (end < 0) end = lines.length;
    }
    if (spec.from) start += 0; // keep the heading: it becomes a section of the chapter
    else start += 1;
  } else if (spec.intro) {
    const h1 = find(/.*/);
    title = h1 >= 0 ? headingOf(lines[h1].line).text : '';
    start = h1 + 1;
    end = lines.findIndex((l, i) => i > start && !l.fenced && /^##\s/.test(l.line));
    if (end < 0) end = lines.length;
  } else {
    const h1 = lines.findIndex((l) => !l.fenced && /^#\s/.test(l.line));
    if (h1 >= 0) { title = headingOf(lines[h1].line).text; start = h1 + 1; }
  }
  let body = lines.slice(start, end);
  for (const re of spec.drop || []) body = body.filter((l) => l.fenced || !re.test(l.line));
  return { file: spec.file, title: tidyTitle(title), lines: body };
}

/** Headings shifted so the shallowest one in the chapter is a level-2. */
function demote(lines) {
  const levels = lines.filter((l) => !l.fenced && headingOf(l.line)).map((l) => headingOf(l.line).level);
  if (!levels.length) return lines;
  const shift = 2 - Math.min(...levels);
  return lines.map((l) => {
    const h = !l.fenced && headingOf(l.line);
    if (!h) return l;
    const level = Math.min(6, Math.max(2, h.level + shift));
    return { ...l, line: `${'#'.repeat(level)} ${h.text}` };
  });
}

// ------------------------------------------------------------- Markdown ---
// The same small Markdown as docs/handbook/build-pdf.js, which has carried the
// handbook for months, plus what a book needs: anchors that are unique across
// the whole book, links between chapters that stay inside the PDF, callouts,
// pictures from anywhere in the repository, and long code and long tables
// allowed to break across a page.
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A title as plain words, for the contents: no Markdown marks. */
const plain = (t) => t.replace(/\*\*?([^*]+)\*\*?/g, '$1').replace(/`([^`]+)`/g, '$1');
const slug = (t) => t.toLowerCase().replace(/<[^>]+>/g, '').replace(/[`*_]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

class Book {
  constructor(spec) {
    this.spec = spec;
    this.chapters = [];   // { n, key, title, file, md lines, part }
    this.byFile = new Map(); // repo path -> [chapter]
  }

  /** Where a link goes: inside the book when the page is in it, else GitHub. */
  link(href, chapter) {
    if (/^(https?:|mailto:)/i.test(href)) return { href, external: true };
    const [target, anchor] = href.split('#');
    if (!target) {
      // #anchor: this chapter first, then any other chapter cut from the same file.
      const own = chapter.anchors.get(slug(anchor));
      if (own) return { href: `#${own}` };
      for (const c of this.byFile.get(chapter.file) || []) if (c.anchors.has(slug(anchor))) return { href: `#${c.anchors.get(slug(anchor))}` };
      return null;
    }
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(chapter.file), target.replace(/^\.\//, '')));
    const inBook = this.byFile.get(resolved);
    if (inBook) {
      if (anchor) for (const c of inBook) if (c.anchors.has(slug(anchor))) return { href: `#${c.anchors.get(slug(anchor))}` };
      return { href: `#${inBook[0].key}` };
    }
    if (resolved.startsWith('..')) return null;
    const kind = /\/$|^[^.]+$/.test(resolved) ? 'tree' : 'blob';
    return { href: `${REPO}/${kind}/main/${resolved.replace(/\/$/, '')}${anchor ? `#${anchor}` : ''}`, external: true, short: resolved };
  }
}

function inline(text, ctx) {
  const codes = [];
  let out = text.replace(/`([^`]+)`/g, (_, code) => { codes.push(code); return `\u0000${codes.length - 1}\u0000`; });
  out = esc(out);
  // Pictures before links: `![alt](src)` is a link with a `!` in front.
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt, src) => {
    const pic = pictures.get(path.resolve(ROOT, path.dirname(ctx.chapter.file), src));
    if (!pic) return '';
    return `<figure class="${pic.phone ? 'phone' : 'wide'}"><img src="${pic.src}" alt="${alt}">${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>`;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const to = ctx.book.link(href.replace(/&amp;/g, '&'), ctx.chapter);
    if (!to) return label;
    const print = to.external ? ` data-print="${esc(to.short || to.href)}"` : '';
    return `<a href="${esc(to.href)}"${print}>${label}</a>`;
  });
  // Bold may hold italics (**the screens decide what to *show***), so it is
  // matched lazily, between marks that touch a word.
  out = out.replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*(?!\*)/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[\s(])_([^_\s][^_]*?)_(?=[\s.,;:)!?]|$)/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
}

const CALLOUTS = { NOTE: 'note', IMPORTANT: 'important', CAUTION: 'caution', 'GOOD TO KNOW': 'tip', TIP: 'tip', WARNING: 'caution' };

function render(lines, ctx) {
  const html = [];
  let i = 0;
  const list = { open: null };
  const close = () => { if (list.open) { html.push(`</${list.open}>`); list.open = null; } };
  const text = (k) => (lines[k] ? lines[k].line : '');

  while (i < lines.length) {
    const line = text(i);

    if (isFence(line)) {
      close();
      const lang = line.replace(/^\s*```/, '').trim();
      const body = [];
      i += 1;
      while (i < lines.length && !isFence(text(i))) body.push(text(i++));
      i += 1;
      html.push(`<pre class="${body.length > 30 ? 'long' : ''}"${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }

    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(text(i + 1))) {
      close();
      const cells = (row) => row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|/.test(text(i))) body.push(cells(text(i++)));
      html.push(`<table class="${body.length > 14 ? 'long' : ''}"><thead><tr>${head.map((c) => `<th>${inline(c, ctx)}</th>`).join('')}</tr></thead><tbody>${
        body.map((r) => `<tr>${r.map((c) => `<td>${inline(c, ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }

    const h = headingOf(line);
    if (h) {
      close();
      const id = ctx.chapter.anchors.get(slug(h.text)) || `${ctx.chapter.key}-${slug(h.text)}`;
      const mark = h.level === 2 && ctx.marks ? `<span class="mk">@@${id}@@</span>` : '';
      html.push(`<h${h.level} id="${id}">${mark}${inline(h.text, ctx)}</h${h.level}>`);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      close();
      const body = [];
      while (i < lines.length && /^>\s?/.test(text(i))) body.push({ line: text(i++).replace(/^>\s?/, ''), fenced: false });
      const first = body.find((l) => l.line.trim());
      const m = first && first.line.match(/^\*\*([A-Z][A-Z ]+?)\*\*\s*[·:—-]?\s*/);
      const kind = m && CALLOUTS[m[1]];
      if (kind) {
        first.line = first.line.slice(m[0].length);
        html.push(`<aside class="callout ${kind}"><div class="label">${esc(m[1])}</div>${render(body, ctx)}</aside>`);
      } else {
        html.push(`<blockquote>${render(body, ctx)}</blockquote>`);
      }
      continue;
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { close(); html.push('<hr>'); i += 1; continue; }

    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const want = bullet ? 'ul' : 'ol';
      if (list.open !== want) {
        close();
        html.push(numbered && numbered[2] !== '1' ? `<ol start="${numbered[2]}">` : `<${want}>`);
        list.open = want;
      }
      const indent = (bullet || numbered)[1].length;
      const parts = [bullet ? bullet[2] : numbered[3]];
      const nested = [];
      i += 1;
      // Continuation lines, indented or not (Markdown's "lazy" continuation),
      // until a blank line or the start of another block.
      while (i < lines.length && text(i).trim() && !/^\s*([-*+]\s|\d+[.)]\s)/.test(text(i)) && !isFence(text(i))
        && !headingOf(text(i)) && !/^(>|\s*\|)/.test(text(i)) && !/^\s*(---+|\*\*\*+)\s*$/.test(text(i))) {
        parts.push(text(i).trim()); i += 1;
      }
      // A deeper list under this item.
      while (i < lines.length && /^\s*([-*+]\s|\d+[.)]\s)/.test(text(i)) && text(i).match(/^(\s*)/)[1].length > indent) {
        nested.push({ line: text(i).replace(new RegExp(`^\\s{0,${indent + 4}}`), ''), fenced: false });
        i += 1;
        while (i < lines.length && text(i).trim() && /^\s+\S/.test(text(i)) && !/^\s*([-*+]\s|\d+[.)]\s)/.test(text(i))) {
          nested.push({ line: `  ${text(i).trim()}`, fenced: false }); i += 1;
        }
      }
      html.push(`<li>${inline(parts.join(' '), ctx)}${nested.length ? render(nested, ctx) : ''}</li>`);
      continue;
    }

    if (!line.trim()) { close(); i += 1; continue; }

    close();
    const para = [];
    while (i < lines.length && text(i).trim() && !headingOf(text(i)) && !isFence(text(i))
      && !/^(>|\s*\|)/.test(text(i)) && !/^\s*([-*+]\s|\d+[.)]\s)/.test(text(i)) && !/^\s*(---+|\*\*\*+)\s*$/.test(text(i))) {
      para.push(text(i++));
    }
    if (!para.length) { html.push(`<p>${inline(line, ctx)}</p>`); i += 1; continue; }
    const onlyPictures = para.every((l) => /^\s*(!\[[^\]]*\]\([^)]+\)\s*)+$/.test(l));
    if (onlyPictures) {
      const figs = para.join(' ').match(/!\[[^\]]*\]\([^)]+\)/g).map((p) => inline(p, ctx)).filter(Boolean);
      html.push(`<div class="figures n${figs.length}">${figs.join('')}</div>`);
    } else {
      html.push(`<p>${inline(para.join(' ').replace(/\s{2,}$/, ''), ctx)}</p>`);
    }
  }
  close();
  return html.join('\n');
}

// ------------------------------------------------------------- the atlas ---
// Every room and folder, a phone and a computer side by side, read from the
// manifests the screenshot script wrote.
function manifest() {
  const all = [];
  if (!fs.existsSync(SHOTS)) return all;
  for (const f of fs.readdirSync(SHOTS).filter((n) => /^manifest.*\.json$/.test(n)).sort()) {
    all.push(...JSON.parse(fs.readFileSync(path.join(SHOTS, f), 'utf8')));
  }
  return all.filter((e) => fs.existsSync(path.join(ROOT, 'docs', e.file)));
}

function atlasHtml(chapter, { role, about }) {
  const shots = manifest();
  const key = (e) => `${e.room}\u0001${e.folder}`;
  const phone = shots.filter((e) => e.device === 'phone' && e.role === role && e.group === 'rooms');
  const computer = new Map(shots.filter((e) => e.device === 'computer' && e.role === role && e.group === 'rooms').map((e) => [key(e), e]));
  const menu = shots.find((e) => e.device === 'phone' && e.role === role && e.group === 'menu');
  const out = [];
  const pic = (e, cls) => {
    const p = pictures.get(path.join(ROOT, 'docs', e.file));
    return p ? `<figure class="${cls}"><img src="${p.src}" alt="${esc(e.caption)}"><figcaption>${cls === 'phone' ? 'On a phone' : 'On a computer'}</figcaption></figure>` : '';
  };
  if (menu) {
    out.push(`<h2 id="${chapter.key}-menu"><span class="mk">@@${chapter.key}-menu@@</span>The Menu</h2>`);
    out.push(`<div class="atlas-entry"><div class="atlas-text"><p>${esc(about.menu || '')}</p></div><div class="atlas-row">${pic(menu, 'phone')}</div></div>`);
  }
  let room = '';
  for (const e of phone) {
    if (e.room !== room) {
      room = e.room;
      const id = `${chapter.key}-${slug(room)}`;
      out.push(`<h2 id="${id}"><span class="mk">@@${id}@@</span>${esc(room)}</h2>`);
      const r = about.room(room);
      if (r) out.push(`<p class="atlas-room">${inline(r, { book: chapter.book, chapter })}</p>`);
    }
    const c = computer.get(key(e));
    const d = e.folder ? about.folder(room, e.folder) : '';
    out.push(`<div class="atlas-entry">${e.folder ? `<h3>${esc(room)} <span class="sep">›</span> ${esc(e.folder)}</h3>` : ''}${
      d ? `<p class="atlas-desc">${inline(d, { book: chapter.book, chapter })}</p>` : ''}<div class="atlas-row">${pic(e, 'phone')}${c ? pic(c, 'wide') : ''}</div></div>`);
  }
  return out.join('\n');
}

function galleryHtml(chapter, { filter, columns = 2, heading }) {
  const shots = manifest().filter(filter);
  const out = [];
  let group = '';
  for (const e of shots) {
    const g = heading ? heading(e) : '';
    if (g && g !== group) {
      group = g;
      const id = `${chapter.key}-${slug(g)}`;
      out.push(`${out.length ? '</div>' : ''}<h2 id="${id}"><span class="mk">@@${id}@@</span>${esc(g)}</h2><div class="gallery c${columns}">`);
    } else if (!out.length) out.push(`<div class="gallery c${columns}">`);
    const p = pictures.get(path.join(ROOT, 'docs', e.file));
    if (p) out.push(`<figure class="${p.phone ? 'phone' : 'wide'}"><img src="${p.src}" alt="${esc(e.caption)}"><figcaption>${esc(e.caption)}</figcaption></figure>`);
  }
  if (out.length) out.push('</div>');
  return out.join('\n');
}

// ------------------------------------------------------------- assembly ---
async function assemble(spec) {
  const book = new Book(spec);
  let n = 0;
  for (const [p, part] of spec.parts.entries()) {
    part.key = `p${p + 1}`;
    part.roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][p];
    for (const ch of part.chapters) {
      n += 1;
      const sources = (ch.src ? [].concat(ch.src) : []).map(slice);
      // A flat chapter keeps its headings as they are: a long list of small
      // entries, not a chapter of sections.
      const joined = sources.flatMap((s, k) => (k ? [{ line: '', fenced: false }] : []).concat(s.lines));
      const lines = ch.flat ? joined : demote(joined);
      const chapter = {
        n, key: `c${n}`, part, book, spec: ch,
        title: ch.title || (sources[0] && sources[0].title) || 'Untitled',
        file: sources[0] ? sources[0].file : (ch.file || 'docs/guides/'),
        lines, anchors: new Map(),
      };
      for (const l of lines) {
        const h = !l.fenced && headingOf(l.line);
        if (h && !chapter.anchors.has(slug(h.text))) chapter.anchors.set(slug(h.text), `${chapter.key}-${slug(h.text)}`);
      }
      book.chapters.push(chapter);
      for (const s of sources) {
        if (!book.byFile.has(s.file)) book.byFile.set(s.file, []);
        book.byFile.get(s.file).push(chapter);
      }
    }
  }
  // Every picture, shrunk once, before anything is drawn.
  for (const c of book.chapters) {
    for (const l of c.lines) {
      if (l.fenced) continue;
      for (const m of l.line.replace(/`[^`]*`/g, '').matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) await prepare(path.resolve(ROOT, path.dirname(c.file), m[1]));
    }
  }
  for (const e of manifest()) await prepare(path.join(ROOT, 'docs', e.file));
  for (const extra of spec.coverPictures || []) await prepare(path.join(ROOT, extra));
  return book;
}

function chapterHtml(c, marks) {
  const ctx = { book: c.book, chapter: c, marks };
  const sections = c.lines.filter((l) => !l.fenced && /^##\s/.test(l.line)).map((l) => headingOf(l.line).text);
  let body = render(c.lines, ctx);
  if (c.spec.atlas) body += atlasHtml(c, c.spec.atlas);
  if (c.spec.gallery) body += galleryHtml(c, c.spec.gallery);
  const atlasRooms = c.spec.atlas ? [...new Set(manifest().filter((e) => e.device === 'phone' && e.role === c.spec.atlas.role && e.group === 'rooms').map((e) => e.room))] : [];
  const gallerySections = c.spec.gallery && c.spec.gallery.heading ? [...new Set(manifest().filter(c.spec.gallery.filter).map(c.spec.gallery.heading))] : [];
  const inThis = [...sections.map((s) => [c.anchors.get(slug(s)), s]), ...atlasRooms.map((r) => [`${c.key}-${slug(r)}`, r]), ...gallerySections.map((g) => [`${c.key}-${slug(g)}`, g])];
  const mini = inThis.length >= 3
    ? `<nav class="mini"><div class="label">In this chapter</div>${inThis.map(([id, s]) => `<a class="row" href="#${id}"><span class="t">${inline(s, ctx)}</span><span class="dots"></span><span class="pg" data-k="${id}"></span></a>`).join('')}</nav>`
    : '';
  const lead = c.spec.lead ? `<p class="lead">${inline(c.spec.lead, ctx)}</p>` : '';
  const source = c.spec.src ? [].concat(c.spec.src).map((s) => s.file) : [];
  const from = source.length ? `<p class="source">From <code>${[...new Set(source)].join('</code>, <code>')}</code></p>` : '';
  return `<section class="chapter${c.spec.atlas || c.spec.gallery ? ' atlas' : ''}" id="${c.key}">
<div class="chapter-head"><div class="eyebrow">${marks ? `<span class="mk">@@${c.key}@@</span>` : ''}Chapter ${c.n}</div><h1>${inline(c.title, ctx)}</h1>${lead}${from}</div>
${mini}
${body}
</section>`;
}

function partHtml(part, marks) {
  return `<section class="part" id="${part.key}"><div class="part-inner">
<div class="eyebrow">${marks ? `<span class="mk">@@${part.key}@@</span>` : ''}Part ${part.roman}</div>
<h1>${esc(part.title)}</h1>
${part.intro ? `<p class="part-intro">${esc(part.intro)}</p>` : ''}
<div class="part-list">${part.chapters.map((ch) => {
    const c = ch._c;
    return `<a class="row" href="#${c.key}"><span class="n">${c.n}</span><span class="t">${esc(plain(c.title))}</span><span class="dots"></span><span class="pg" data-k="${c.key}"></span></a>`;
  }).join('')}</div>
</div></section>`;
}

function contentsHtml(book) {
  const rows = [];
  for (const part of book.spec.parts) {
    rows.push(`<a class="row part-row" href="#${part.key}"><span class="n">${part.roman}</span><span class="t">${esc(part.title)}</span><span class="dots"></span><span class="pg" data-k="${part.key}"></span></a>`);
    for (const ch of part.chapters) {
      const c = ch._c;
      rows.push(`<a class="row" href="#${c.key}"><span class="n">${c.n}</span><span class="t">${esc(plain(c.title))}</span><span class="dots"></span><span class="pg" data-k="${c.key}"></span></a>`);
    }
  }
  return `<section class="contents"><h1 id="contents">Contents</h1><div class="toc">${rows.join('')}</div></section>`;
}

function frontHtml(book, marks) {
  const ctx = { book, chapter: { file: book.spec.about, key: 'about', anchors: new Map() }, marks: false };
  const about = slice({ file: book.spec.about });
  for (const l of about.lines) { const h = !l.fenced && headingOf(l.line); if (h) ctx.chapter.anchors.set(slug(h.text), `about-${slug(h.text)}`); }
  return `<section class="front" id="about"><div class="eyebrow">${marks ? '<span class="mk">@@about@@</span>' : ''}Before you begin</div><h1>${esc(about.title)}</h1>${render(demote(about.lines), ctx)}</section>`;
}

function coverHtml(book) {
  const pic = book.spec.coverPictures && pictures.get(path.join(ROOT, book.spec.coverPictures[0]));
  const pic2 = book.spec.coverPictures && book.spec.coverPictures[1] && pictures.get(path.join(ROOT, book.spec.coverPictures[1]));
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS} @page { margin: 0; }</style></head><body class="cover-body">
<section class="cover">
  <div class="cover-top"><div class="brand"><span class="beacon"></span>Hope Beacon</div><div class="kind">${esc(book.spec.kind)}</div></div>
  <div class="cover-main">
    <div class="cover-words">
      <div class="eyebrow">The complete guide</div>
      <h1>${esc(book.spec.title)}</h1>
      <p class="sub">${esc(book.spec.subtitle)}</p>
      <ul class="for">${book.spec.audience.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    </div>
    <div class="cover-pics">${pic ? `<img class="p1 ${pic.phone ? 'phone' : 'wide'}" src="${pic.src}" alt="">` : ''}${pic2 ? `<img class="p2 ${pic2.phone ? 'phone' : 'wide'}" src="${pic2.src}" alt="">` : ''}</div>
  </div>
  <div class="cover-foot"><span>Edition of ${esc(EDITION)}${COMMIT ? ` · app at <code>${esc(COMMIT)}</code>` : ''}</span><span>Open source · AGPL-3.0-only</span></div>
</section></body></html>`;
}

function bookHtml(book, marks, pages = new Map()) {
  for (const part of book.spec.parts) for (const ch of part.chapters) ch._c = book.chapters.find((c) => c.spec === ch);
  const chapters = [];
  for (const part of book.spec.parts) {
    chapters.push(partHtml(part, marks));
    for (const ch of part.chapters) chapters.push(chapterHtml(ch._c, marks));
  }
  let html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(book.spec.title)}</title><style>${CSS}</style></head><body>
${frontHtml(book, marks)}
${contentsHtml(book)}
${chapters.join('\n')}
</body></html>`;
  html = html.replace(/<span class="pg" data-k="([^"]+)"><\/span>/g, (_, k) => `<span class="pg">${pages.get(k) || (marks ? '000' : '')}</span>`);
  return html;
}

// ---------------------------------------------------------------- styles ---
const CSS = `
@page { size: A4; margin: 19mm 18mm 21mm; }
:root { --ink: #1c2230; --navy: #0b1f3a; --gold: #c9a227; --muted: #5b6474; --rule: #d8dce3; --paper: #ffffff; --tint: #f4f6f9; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 10.2pt/1.56 'Charter', 'Bitstream Charter', Georgia, 'DejaVu Serif', serif; color: var(--ink); background: var(--paper); hyphens: auto; }
h1, h2, h3, h4, h5, h6, .eyebrow, .toc, .mini, .part-list, figcaption, th, .callout .label, .source, .atlas-room, .atlas-desc, .lead { font-family: 'Liberation Sans', 'Helvetica Neue', Arial, 'DejaVu Sans', sans-serif; }
code, pre { font-family: 'DejaVu Sans Mono', 'Liberation Mono', Menlo, Consolas, monospace; }
.mk { position: absolute; font-size: 1px; line-height: 1px; color: inherit; text-transform: none; letter-spacing: 0; }
h1, h2, h3, h4 { color: var(--navy); line-height: 1.22; break-after: avoid; text-wrap: balance; hyphens: manual; }
h2 { font-size: 15pt; margin: 22pt 0 7pt; padding-bottom: 4pt; border-bottom: 1.2pt solid var(--gold); position: relative; }
h3 { font-size: 12pt; margin: 16pt 0 5pt; }
h4 { font-size: 10.6pt; margin: 12pt 0 4pt; }
h5, h6 { font-size: 10.2pt; margin: 10pt 0 3pt; font-style: italic; color: var(--navy); break-after: avoid; }
p { margin: 0 0 7pt; orphans: 3; widows: 3; }
ul, ol { margin: 4pt 0 8pt 17pt; padding: 0; }
li { margin: 2.5pt 0; }
li > ul, li > ol { margin-top: 2pt; margin-bottom: 2pt; }
strong { color: #0f203d; }
a { color: var(--navy); text-decoration: none; border-bottom: 0.5pt solid #9aa3b2; }
a[data-print]::after { content: " \\2192 " attr(data-print); font: 7pt 'Liberation Sans', sans-serif; color: var(--muted); border: none; word-break: break-all; }
code { font-size: 8.4pt; background: var(--tint); padding: 0.5pt 3pt; border-radius: 2pt; border: 0.4pt solid #e3e7ee; word-break: break-word; hyphens: none; }
pre { background: #0e1b30; color: #eef2f8; padding: 8pt 10pt; border-radius: 3pt; white-space: pre-wrap; overflow-wrap: anywhere; margin: 7pt 0 9pt; break-inside: avoid; font-size: 7.9pt; line-height: 1.45; position: relative; }
pre.long { break-inside: auto; }
pre[data-lang]::before { content: attr(data-lang); position: absolute; right: 8pt; top: 4pt; font: 6.5pt 'Liberation Sans', sans-serif; color: #8fa0bb; text-transform: uppercase; letter-spacing: 0.08em; }
pre code { background: none; border: none; padding: 0; font-size: inherit; color: inherit; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0 10pt; font-size: 8.9pt; line-height: 1.4; break-inside: avoid; }
table.long { break-inside: auto; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th { background: var(--navy); color: #fff; text-align: left; padding: 4pt 6pt; font-size: 8.4pt; font-weight: 700; }
td { border-bottom: 0.5pt solid var(--rule); padding: 4pt 6pt; vertical-align: top; }
tbody tr:nth-child(even) td { background: #fafbfc; }
td code { font-size: 7.8pt; }
blockquote { margin: 9pt 0; padding: 7pt 11pt; background: var(--tint); border-left: 2.5pt solid #9aa3b2; break-inside: avoid; }
blockquote p:last-child, .callout p:last-child { margin-bottom: 0; }
.callout { margin: 10pt 0; padding: 8pt 11pt 8pt 12pt; border-radius: 3pt; break-inside: avoid; border: 0.6pt solid; }
.callout .label { font-size: 7pt; font-weight: 700; letter-spacing: 0.12em; margin-bottom: 3pt; }
.callout.note { background: #f1f5fb; border-color: #c7d4e8; } .callout.note .label { color: #2a4f86; }
.callout.tip { background: #f2f8f1; border-color: #c4dcc0; } .callout.tip .label { color: #2f6b2a; }
.callout.important { background: #fbf7ea; border-color: #e6d49a; } .callout.important .label { color: #7a5c00; }
.callout.caution { background: #fbf1ef; border-color: #e7c2bb; } .callout.caution .label { color: #9a2f1f; }
hr { border: none; border-top: 0.5pt solid var(--rule); margin: 14pt 0; }
figure { margin: 10pt auto; text-align: center; break-inside: avoid; }
figure img { max-width: 100%; max-height: 150mm; border: 0.6pt solid var(--rule); border-radius: 3pt; display: block; margin: 0 auto; }
figure.phone { width: 58mm; }
figure.phone img { width: 100%; max-height: none; border-radius: 6pt; }
figcaption { margin-top: 4pt; font-size: 7.6pt; color: var(--muted); line-height: 1.35; }
.figures { display: flex; justify-content: center; align-items: flex-start; gap: 6mm; break-inside: avoid; flex-wrap: wrap; margin: 8pt 0; }
.figures figure { margin: 0; }
.figures.n3 figure.phone, .figures.n4 figure.phone { width: 48mm; }
.figures figure.wide { width: 84mm; }
.figures.n1 figure.wide { width: 100%; }

/* Front matter, contents, parts and chapters */
.eyebrow { font-size: 8pt; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--gold); position: relative; }
.front { break-after: page; }
.front h1, .contents h1 { font-size: 26pt; margin: 6mm 0 8mm; }
.contents { break-after: page; }
.toc .row, .mini .row, .part-list .row { display: flex; align-items: baseline; gap: 6pt; border: none; color: var(--ink); }
.toc .row { font-size: 9.6pt; padding: 2.2pt 0; }
.toc .row .n { width: 9mm; color: var(--muted); font-variant-numeric: tabular-nums; }
.toc .part-row { font-weight: 700; color: var(--navy); font-size: 10.4pt; margin-top: 8pt; padding-top: 5pt; border-top: 0.6pt solid var(--rule); }
.toc .part-row .n { color: var(--gold); }
.row .dots { flex: 1; border-bottom: 0.8pt dotted #b5bcc8; transform: translateY(-3pt); min-width: 8mm; }
.row .pg { min-width: 9mm; text-align: right; font-variant-numeric: tabular-nums; color: var(--navy); }
@page bleed { margin: 0; }
.part { page: bleed; break-before: page; height: 296mm; background: var(--navy); color: #fff; margin: 0; padding: 0; position: relative; overflow: hidden; }
.part::before { content: ''; position: absolute; right: -70mm; bottom: -80mm; width: 200mm; height: 200mm; border-radius: 50%; background: radial-gradient(circle, rgba(201,162,39,0.22), rgba(201,162,39,0) 65%); }
.part-inner { padding: 52mm 24mm 0; position: relative; }
.part .eyebrow { font-size: 10pt; }
.part h1 { color: #fff; font-size: 34pt; margin: 4mm 0 6mm; max-width: 150mm; }
.part-intro { font-size: 11.5pt; line-height: 1.55; color: #d7deea; max-width: 140mm; margin-bottom: 12mm; }
.part-list .row { color: #fff; font-size: 10.5pt; padding: 3pt 0; max-width: 150mm; }
.part-list .row .n { width: 9mm; color: var(--gold); font-weight: 700; }
.part-list .row .dots { border-color: #4b6187; }
.part-list .row .pg { color: #fff; }
.chapter { break-before: page; }
.chapter-head { margin: 4mm 0 8mm; padding-bottom: 6mm; border-bottom: 2pt solid var(--navy); }
.chapter-head h1 { font-size: 24pt; margin: 2mm 0 0; }
.lead { font-size: 11pt; color: #3a4252; margin: 4mm 0 0; line-height: 1.5; }
.source { font-size: 7.4pt; color: var(--muted); margin: 3mm 0 0; }
.source code { font-size: 7pt; background: none; border: none; padding: 0; }
.mini { margin: 0 0 9mm; padding: 6pt 10pt 7pt; background: var(--tint); border-radius: 3pt; break-inside: avoid; }
.mini .label { font-size: 7pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin-bottom: 3pt; }
.mini .row { font-size: 8.8pt; padding: 1.3pt 0; }
.mini .row .t { max-width: 140mm; }

/* The atlas: a folder on a phone and on a computer, side by side */
.atlas h2 { break-before: auto; }
.atlas-room { font-size: 9.2pt; color: #3a4252; margin: 0 0 6pt; }
.atlas-entry { break-inside: avoid; margin: 0 0 7mm; }
.atlas-entry h3 { font-size: 10.5pt; margin: 4pt 0 2pt; }
.atlas-entry h3 .sep { color: var(--gold); }
.atlas-desc { font-size: 8.8pt; color: #3a4252; margin: 0 0 4pt; line-height: 1.42; }
.atlas-row { display: flex; gap: 5mm; align-items: flex-start; }
.atlas-row figure { margin: 0; }
.atlas-row figure.phone { width: 41mm; flex: none; }
.atlas-row figure.wide { flex: 1; }
.atlas-row figure.wide img { max-height: none; width: 100%; }
.atlas-text { font-size: 9.2pt; }
.gallery { display: grid; gap: 6mm 5mm; margin: 4pt 0 8pt; }
.gallery.c2 { grid-template-columns: 1fr 1fr; }
.gallery.c3 { grid-template-columns: 1fr 1fr 1fr; }
.gallery.c4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
.gallery figure { margin: 0; width: auto; }
.gallery figure img { width: 100%; max-height: none; }

/* The cover */
.cover-body { margin: 0; }
.cover { width: 210mm; height: 297mm; background: var(--navy); color: #fff; padding: 20mm 18mm 16mm; display: flex; flex-direction: column; position: relative; overflow: hidden; }
.cover::before { content: ''; position: absolute; right: -60mm; top: -50mm; width: 190mm; height: 190mm; border-radius: 50%; background: radial-gradient(circle, rgba(201,162,39,0.33), rgba(201,162,39,0) 65%); }
.cover-top { display: flex; justify-content: space-between; align-items: center; font: 700 10pt 'Liberation Sans', sans-serif; letter-spacing: 0.04em; position: relative; }
.cover-top .brand { display: flex; align-items: center; gap: 8pt; font-size: 13pt; }
.cover-top .beacon { width: 13pt; height: 13pt; border-radius: 50%; background: var(--gold); box-shadow: 0 0 0 4pt rgba(201,162,39,0.25); }
.cover-top .kind { color: var(--gold); text-transform: uppercase; letter-spacing: 0.18em; font-size: 8pt; }
.cover-main { flex: 1; display: grid; grid-template-columns: 1fr 92mm; gap: 9mm; align-items: center; position: relative; }
.cover-words { min-width: 0; }
.cover h1 { color: #fff; font-size: 36pt; line-height: 1.08; margin: 4mm 0 6mm; }
.cover .sub { font: 12.5pt/1.5 'Charter', 'Bitstream Charter', Georgia, serif; color: #dbe3ef; margin: 0 0 9mm; }
.cover .for { list-style: none; margin: 0; padding: 0; font: 9.5pt/1.5 'Liberation Sans', sans-serif; color: #c7d2e3; }
.cover .for li { padding: 3pt 0 3pt 12pt; border-left: 1.5pt solid var(--gold); margin: 0 0 4pt; }
.cover-pics { position: relative; height: 172mm; }
.cover-pics img { position: absolute; border-radius: 8pt; border: 2.5pt solid #1d3457; box-shadow: 0 10pt 30pt rgba(0,0,0,0.45); }
.cover-pics .phone { width: 54mm; }
.cover-pics .wide { width: 92mm; border-radius: 5pt; }
.cover-pics .p1 { right: 0; top: 0; }
.cover-pics .p2 { left: 0; top: 46mm; }
.cover-pics .wide.p1 { top: 6mm; }
.cover-pics .phone.p2 { left: 4mm; top: 50mm; }
.cover-foot { display: flex; justify-content: space-between; font: 8pt 'Liberation Sans', sans-serif; color: #9fb0c9; border-top: 0.6pt solid #2b4466; padding-top: 4mm; position: relative; }
.cover-foot code { background: none; border: none; color: #c7d2e3; font-size: 7.6pt; }
`;

// ---------------------------------------------------------------- output ---
async function print(page, html, out, { footer, cover = false }) {
  const file = out.replace(/\.pdf$/, '.html');
  fs.writeFileSync(file, html);
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 0 });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: out, format: 'A4', preferCSSPageSize: true, printBackground: true, outline: !cover, tagged: true, timeout: 0,
    displayHeaderFooter: !cover,
    headerTemplate: '<span></span>',
    footerTemplate: cover ? '<span></span>' : `<div style="width:100%;padding:0 18mm;font:7.5pt 'Liberation Sans',Arial,sans-serif;color:#6b7383;display:flex;justify-content:space-between;-webkit-print-color-adjust:exact;"><span>${esc(footer)}</span><span><span class="pageNumber"></span></span></div>`,
    ...(cover ? { margin: { top: 0, right: 0, bottom: 0, left: 0 } } : {}),
  });
}

/**
 * The cover in front of the book. pdf-lib (installed with the Study Room's
 * editor) puts the cover page INTO the printed book, which keeps the book's
 * bookmarks; pdfunite would make a new file and drop them, so it is only the
 * fallback.
 */
async function join(cover, body, out) {
  let lib = null;
  try { lib = await import('pdf-lib'); } catch { /* fall back */ }
  if (!lib) {
    console.warn('  ! pdf-lib not installed: joined with pdfunite, without bookmarks');
    execFileSync('pdfunite', [cover, body, out]);
    return;
  }
  const doc = await lib.PDFDocument.load(fs.readFileSync(body));
  const front = await lib.PDFDocument.load(fs.readFileSync(cover));
  const [page] = await doc.copyPages(front, [0]);
  doc.insertPage(0, page);
  doc.setTitle(path.basename(out, '.pdf').replace(/-/g, ' '));
  doc.setAuthor('Hope Beacon contributors');
  doc.setSubject('Hope Beacon, open source church app');
  fs.writeFileSync(out, await doc.save());
}

/** Page number of every marker, from the printed text. */
function findMarks(pdf) {
  const text = execFileSync('pdftotext', ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const pages = new Map();
  text.split('\f').forEach((t, i) => { for (const m of t.matchAll(/@@([\w-]+)@@/g)) if (!pages.has(m[1])) pages.set(m[1], String(i + 1)); });
  return pages;
}

const which = process.argv[2] || 'all';
const books = [USING, BUILDING].filter((b) => which === 'all' || b.id === which);
fs.mkdirSync(WORK, { recursive: true });
const { browser: engine, launchOptions } = require('../../tests/e2e/_playwright.js');
const browser = await engine.launch(launchOptions);
try {
  for (const spec of books) {
    const started = Date.now();
    const book = await assemble(spec);
    const page = await browser.newPage();
    const body = path.join(WORK, `${spec.id}-body.pdf`);
    await print(page, bookHtml(book, true), body, { footer: spec.footer });
    const pages = findMarks(body);
    const missing = book.chapters.filter((c) => !pages.has(c.key)).map((c) => c.title);
    if (missing.length) console.warn(`  ! no page found for: ${missing.join(', ')}`);
    await print(page, bookHtml(book, false, pages), body, { footer: spec.footer });
    // The second print must not have moved anything: every chapter's opening
    // line is still on the page the contents promise.
    const check = execFileSync('pdftotext', ['-enc', 'UTF-8', body, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\f');
    // Letter-spaced labels come out of pdftotext as "C H A P T E R 1 1".
    const moved = book.chapters.filter((c) => !new RegExp(`CHAPTER${c.n}(?!\\d)`).test((check[Number(pages.get(c.key)) - 1] || '').replace(/\s+/g, '').toUpperCase()));
    if (moved.length) console.warn(`  ! contents may be off for: ${moved.map((c) => c.n).join(', ')}`);
    const cover = path.join(WORK, `${spec.id}-cover.pdf`);
    await print(page, coverHtml(book), cover, { cover: true });
    await page.close();
    const out = path.join(ROOT, 'docs', spec.output);
    await join(cover, body, out);
    const info = execFileSync('pdfinfo', [out], { encoding: 'utf8' });
    const count = info.match(/Pages:\s+(\d+)/)[1];
    const mb = (fs.statSync(out).size / 1048576).toFixed(1);
    console.log(`${rel(out)}: ${count} pages, ${mb} MB, ${book.chapters.length} chapters, ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
} finally {
  await browser.close();
}

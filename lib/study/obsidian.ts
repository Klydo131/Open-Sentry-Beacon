// The study room as an Obsidian vault, and back again.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS, AND IT IS THE SAME ARGUMENT AS components/LiveExport.tsx:
// what somebody writes in this room is theirs. A member who leaves the church,
// or a Guide who prefers to prepare a study on a laptop in an app they already
// trust, should be able to take their pages with them and bring them back. A
// room you can only read inside one website is a room somebody is renting.
//
// OBSIDIAN RATHER THAN "MARKDOWN" IN GENERAL, because the conventions are what
// make the files useful rather than merely readable. This room already has the
// four things Obsidian has, arrived at independently:
//
//   a tag        -> `tags:` in YAML front matter, which Obsidian reads natively
//   a folder     -> a folder
//   the journal  -> a daily note, named for its date
//   a linked page-> [[wikilinks]]
//
// So the mapping is not a translation, it is a spelling.
//
// PURE FUNCTIONS, NO EDITOR. Turning a page's BLOCKS into Markdown is
// BlockSuite's job and needs a live editor; everything around that -- what the
// file is called, where it sits, what its front matter says, and how a folder
// of files becomes a zip -- is decided here, where it can be tested in Node
// against a real `unzip`.
// ---------------------------------------------------------------------------

/** What the room knows about a page, as far as a vault file cares. */
export type VaultPage = {
  id: string;
  title: string;
  tags: string[];
  folder: string;
  /** `YYYY-MM-DD` when this page is the journal entry for that day. */
  journalDate: string;
  created: number;
  updated: number;
  /** The body, already Markdown. */
  markdown: string;
};

/**
 * A file on its way into or out of a vault.
 *
 * `text` for Markdown, `bytes` for a picture. A file has one or the other;
 * both is meaningless and neither is an empty file.
 */
export type VaultFile = { path: string; text?: string; bytes?: Uint8Array };

/** Where pictures live inside the vault, beside the notes rather than among them. */
export const ASSET_FOLDER = 'assets';

/** Where daily notes go when the page is not filed anywhere else. */
export const JOURNAL_FOLDER = 'Journal';

// ---------------------------------------------------------------------------
// NAMES
// ---------------------------------------------------------------------------

/**
 * A page title, made safe to be a filename on every system somebody might
 * open this vault on.
 *
 * WINDOWS IS THE STRICT ONE and it is not close: `\ / : * ? " < > |` are all
 * refused, a name may not END in a dot or a space, and a handful of words --
 * CON, PRN, AUX, NUL, COM1..9, LPT1..9 -- are device names that cannot be used
 * even with an extension. A vault that unpacks on a Mac and fails on a laptop
 * is a vault that fails for half a congregation.
 *
 * The replacement is a space rather than nothing, so "Romans 8:28" becomes
 * "Romans 8 28" and not "Romans 828", which reads as a different verse.
 */
export function safeName(title: string, fallback = 'Untitled'): string {
  const cleaned = String(title ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // A trailing dot or space is legal to WRITE on Windows and then cannot be
    // opened, which is worse than being refused outright.
    .replace(/[. ]+$/, '')
    .slice(0, 120)
    .trim();

  if (!cleaned) return fallback;
  // Device names, with or without an extension, in any case.
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned)) return `${cleaned} page`;
  return cleaned;
}

/**
 * The path a page takes inside the vault, WITHOUT the extension.
 *
 * A journal entry is named for the day it stands for rather than its title,
 * because that is how Obsidian recognises a daily note -- and because the
 * title of a journal page is a thing people rename. "Thursday, 17 September"
 * becoming "Prayer meeting" must not stop it being that day's note.
 */
export function vaultPath(page: Pick<VaultPage, 'title' | 'folder' | 'journalDate' | 'id'>): string {
  const name = page.journalDate
    ? page.journalDate
    : safeName(page.title, `Page ${page.id.slice(0, 6)}`);
  const folder = page.folder
    ? safeName(page.folder, '')
    : (page.journalDate ? JOURNAL_FOLDER : '');
  return folder ? `${folder}/${name}` : name;
}

/**
 * The same, with `.md`, and with collisions settled.
 *
 * TWO PAGES CAN HONESTLY HAVE ONE NAME. Nothing stops a member calling two
 * pages "Notes", and nothing should. One of them has to become "Notes (2)" or
 * the second silently overwrites the first on the way out, which is the kind
 * of loss nobody notices until they look for the page.
 */
export function vaultFilenames(pages: Array<Pick<VaultPage, 'title' | 'folder' | 'journalDate' | 'id'>>): Map<string, string> {
  const taken = new Set<string>();
  const out = new Map<string, string>();
  for (const page of pages) {
    const base = vaultPath(page);
    let path = `${base}.md`;
    let n = 2;
    while (taken.has(path.toLowerCase())) {
      path = `${base} (${n})`.concat('.md');
      n += 1;
    }
    taken.add(path.toLowerCase());
    out.set(page.id, path);
  }
  return out;
}

// ---------------------------------------------------------------------------
// FRONT MATTER
// ---------------------------------------------------------------------------

const asDay = (at: number): string => {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * A YAML value that will survive being read back.
 *
 * Quoted only when it has to be, because an unquoted tag is what a person
 * expects to see when they open the file. `Romans` stays `Romans`; a tag with
 * a colon in it gets quotes, or YAML reads it as a key.
 */
function yamlValue(raw: string): string {
  const s = String(raw ?? '');
  return /^[A-Za-z0-9][A-Za-z0-9 _\-.]*$/.test(s) && !/^\d{4}-\d{2}-\d{2}$/.test(s)
    ? s
    : `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** The `---` block at the top of a vault file. */
export function frontMatter(page: Omit<VaultPage, 'markdown'>): string {
  const lines: string[] = ['---'];
  lines.push(`title: ${yamlValue(page.title)}`);
  if (page.tags.length) {
    lines.push('tags:');
    for (const tag of page.tags) lines.push(`  - ${yamlValue(tag)}`);
  }
  if (page.journalDate) lines.push(`date: ${page.journalDate}`);
  lines.push(`created: ${asDay(page.created)}`);
  lines.push(`updated: ${asDay(page.updated)}`);
  lines.push('---');
  return lines.join('\n');
}

/** A whole file: front matter, a blank line, then the page. */
export function toVaultFile(page: VaultPage): string {
  return `${frontMatter(page)}\n\n${page.markdown.replace(/\s+$/, '')}\n`;
}

/**
 * Split a file back into what it says about itself and what it is.
 *
 * DELIBERATELY NOT A YAML PARSER. It reads the handful of keys this app
 * writes, and anything else in the block is left alone rather than guessed at
 * -- a vault will contain front matter written by Obsidian plugins this app
 * has never heard of, and dropping a key it did not understand would quietly
 * destroy somebody's work on the way in.
 */
export function parseVaultFile(text: string): {
  title: string;
  tags: string[];
  journalDate: string;
  body: string;
  /** Front matter lines this app did not write, kept verbatim. */
  extra: string[];
} {
  const out = { title: '', tags: [] as string[], journalDate: '', body: String(text ?? ''), extra: [] as string[] };
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(out.body);
  if (!m) return out;

  out.body = out.body.slice(m[0].length);
  const unquote = (v: string) => {
    const s = v.trim();
    if (/^"([\s\S]*)"$/.test(s)) return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    if (/^'([\s\S]*)'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
    return s;
  };

  let inTags = false;
  for (const line of m[1].split(/\r?\n/)) {
    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (inTags && listItem) { out.tags.push(unquote(listItem[1])); continue; }
    inTags = false;
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) { if (line.trim()) out.extra.push(line); continue; }
    const [, key, value] = kv;
    if (key === 'title') out.title = unquote(value);
    else if (key === 'date') out.journalDate = unquote(value);
    else if (key === 'tags') {
      if (value.trim() === '') { inTags = true; continue; }
      // Obsidian also accepts `tags: [a, b]` and `tags: a b`.
      const inline = value.trim().replace(/^\[|\]$/g, '');
      out.tags.push(...inline.split(/[,\s]+/).map(unquote).filter(Boolean));
    } else if (key !== 'created' && key !== 'updated') out.extra.push(line);
  }
  return out;
}

// ---------------------------------------------------------------------------
// LINKS
// ---------------------------------------------------------------------------

/** Every `[[target]]` in a body, in the order they appear, without duplicates. */
export function wikilinksIn(markdown: string): string[] {
  const found: string[] = [];
  for (const m of String(markdown ?? '').matchAll(/\[\[([^\][|]+)(?:\|[^\]]*)?\]\]/g)) {
    const target = m[1].trim();
    if (target && !found.includes(target)) found.push(target);
  }
  return found;
}

/**
 * Turn a link to a page id into a link to its title, for the way out.
 *
 * Obsidian resolves `[[Romans 8]]` by NAME, so a vault full of `[[a1b2c3]]` is
 * a vault of broken links -- every one of which looks, to the person who opens
 * it, like the export lost their page.
 */
export function linksToTitles(markdown: string, titleOf: (id: string) => string | undefined): string {
  return String(markdown ?? '').replace(/\[\[([^\][|]+)(\|[^\]]*)?\]\]/g, (whole, target, alias) => {
    const title = titleOf(String(target).trim());
    return title ? `[[${title}${alias ?? ''}]]` : whole;
  });
}

// ---------------------------------------------------------------------------
// PICTURES
// ---------------------------------------------------------------------------
//
// AFFiNE's Markdown adapter writes a picture as `![alt](assets/name.png)`, a
// path RELATIVE TO THE NOTE. That is correct for a flat export and wrong for
// this one: a page filed in Sermons becomes Sermons/Romans 8.md, and a
// relative `assets/name.png` then points at Sermons/assets/name.png, which is
// not where the picture is. Every picture in every filed page would be broken,
// and only for people who use folders.
//
// `![[name.png]]` is Obsidian's own embed, and it resolves BY FILENAME across
// the whole vault, from any depth, without knowing where anything lives. So
// that is what the export writes -- and it is what a person who already uses
// Obsidian writes by hand, which is the same reason the import understands it.

/** `![alt](assets/x.png)` -> `![[x.png]]`, so it resolves from any folder. */
export function picturesAsEmbeds(markdown: string): string {
  return String(markdown ?? '').replace(
    /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (whole, url: string) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return whole;   // a real address, left alone
      const name = decodeURIComponent(url).split('/').pop();
      return name ? `![[${name}]]` : whole;
    },
  );
}

/**
 * `![[x.png]]` -> `![alt](assets/x.png)`, which is what the adapter can read.
 *
 * Only for things that look like a picture: `![[Another page]]` is an embed of
 * a NOTE, which Obsidian also supports, and turning that into a broken image
 * would be worse than leaving it as text somebody can still read.
 */
export function embedsAsPictures(markdown: string): string {
  return String(markdown ?? '').replace(
    /!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g,
    (whole, target: string, alias: string | undefined) => {
      const name = String(target).trim();
      if (!/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name)) return whole;
      return `![${alias ?? ''}](${ASSET_FOLDER}/${encodeURIComponent(name)})`;
    },
  );
}

/** Every picture a note asks for, however it asked. */
export function picturesWanted(markdown: string): string[] {
  const names: string[] = [];
  const add = (raw: string) => {
    const name = decodeURIComponent(String(raw).trim()).split('/').pop();
    if (name && !names.includes(name)) names.push(name);
  };
  for (const m of String(markdown ?? '').matchAll(/!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g)) add(m[1]);
  for (const m of String(markdown ?? '').matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (!/^[a-z][a-z0-9+.-]*:/i.test(m[1])) add(m[1]);
  }
  return names;
}

// ---------------------------------------------------------------------------
// THE ZIP
// ---------------------------------------------------------------------------
//
// A vault is a folder of files, and a browser can hand somebody exactly one
// file. So: a zip, written by hand rather than by adding a dependency to a
// project that ships almost none.
//
// STORED, NOT DEFLATED. The browser can deflate (CompressionStream), but a
// stored entry needs no stream, no async, and no second code path for the
// environments that lack it -- and these are Markdown files measured in
// kilobytes. The saving would be invisible and the risk is a vault nobody can
// open.

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time, which is what a zip entry carries. */
function dosStamp(at: number): { time: number; date: number } {
  const d = new Date(at);
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * A zip somebody can actually open, from a list of files.
 *
 * Paths use forward slashes and UTF-8, with bit 11 of the flags set to say so
 * -- without it a page called "Panalangin" is fine and one with an accent in
 * its name arrives mangled on a machine with a different code page.
 */
export function zipVault(files: VaultFile[], at = Date.now()): Uint8Array {
  const enc = new TextEncoder();
  const stamp = dosStamp(at);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = enc.encode(file.path.replace(/\\/g, '/'));
    const body = file.bytes ?? enc.encode(file.text ?? '');
    const sum = crc32(body);

    const local = new Uint8Array(30 + name.length + body.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);        // version needed
    lv.setUint16(6, 0x0800, true);    // UTF-8 names
    lv.setUint16(8, 0, true);         // stored
    lv.setUint16(10, stamp.time, true);
    lv.setUint16(12, stamp.date, true);
    lv.setUint32(14, sum, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, body.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(body, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);        // version made by
    cv.setUint16(6, 20, true);        // version needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, stamp.time, true);
    cv.setUint16(14, stamp.date, true);
    cv.setUint32(16, sum, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, body.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let at2 = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, at2); at2 += part.length; }
  return out;
}

/**
 * Read a stored zip back. Enough to take a vault somebody exported, or a
 * folder they zipped themselves, and get the Markdown out of it.
 *
 * Deflated entries are REPORTED rather than skipped: a vault that silently
 * imported nine files out of ten would be the worst possible outcome here.
 */
export function unzipVault(bytes: Uint8Array): { files: VaultFile[]; skipped: string[] } {
  const dec = new TextDecoder();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files: VaultFile[] = [];
  const skipped: string[] = [];

  // Walk the local headers; the central directory is not needed to read one.
  let i = 0;
  while (i + 30 <= bytes.length && view.getUint32(i, true) === 0x04034b50) {
    const method = view.getUint16(i + 8, true);
    const compressed = view.getUint32(i + 18, true);
    const nameLen = view.getUint16(i + 26, true);
    const extraLen = view.getUint16(i + 28, true);
    const nameAt = i + 30;
    const dataAt = nameAt + nameLen + extraLen;
    const path = dec.decode(bytes.subarray(nameAt, nameAt + nameLen));
    if (method !== 0) skipped.push(path);
    else if (!path.endsWith('/')) {
      const body = bytes.slice(dataAt, dataAt + compressed);
      // TEXT ONLY WHERE IT IS TEXT. Decoding a PNG as UTF-8 does not fail, it
      // silently produces replacement characters -- and the picture is gone
      // with no error anywhere to say so.
      files.push(/\.(md|markdown|txt|json|csv)$/i.test(path)
        ? { path, text: dec.decode(body) }
        : { path, bytes: body });
    }
    i = dataAt + compressed;
  }
  return { files, skipped };
}

/** The folder a file sits in, as the room's idea of a folder. */
export function folderOf(path: string): string {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  const folder = parts.join('/');
  return folder === JOURNAL_FOLDER ? '' : folder;
}

/** `2026-09-22.md` is a daily note; `Romans 8.md` is not. */
export function journalDateOf(path: string): string {
  const name = path.split('/').pop() ?? '';
  const m = /^(\d{4}-\d{2}-\d{2})\.md$/i.exec(name);
  return m ? m[1] : '';
}

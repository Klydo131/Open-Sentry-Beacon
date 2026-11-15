// Reading an EPUB on the device: open the book, find its chapters, and make
// each chapter safe to show.
//
// ---------------------------------------------------------------------------
// ADDED ON 15 NOVEMBER 2026: a book kept in My Files could not be read in the
// app at all, only downloaded.
//
// AN EPUB IS A WEBSITE IN A ZIP, WRITTEN BY SOMEBODY ELSE. Its chapters are
// XHTML that can carry scripts, event handlers, forms, remote pictures and
// style sheets that call other servers. Three layers keep that out, and each
// one holds if the others fail:
//   1. THE ALLOWLIST (here). A chapter is rebuilt tag by tag from a short list
//      of reading tags; everything else is dropped, and only a few attributes
//      survive. A link never leaves the book; a picture is read out of the book
//      itself and inlined, so nothing is ever fetched from anywhere.
//   2. A CONTENT SECURITY POLICY INSIDE THE CHAPTER ("default-src 'none'"):
//      nothing loads but pictures that are already in it.
//   3. THE SANDBOX on the frame that shows it (components/EpubReader.tsx), with
//      no scripts allowed, so even a hole in 1 and 2 cannot run code.
//
// THE ZIP IS UNTRUSTED TOO. A small file can inflate to gigabytes, so every
// entry is read through a counter that stops it at a limit, and the entry
// count is capped. No library: the zip format needs about sixty lines, and the
// browser already inflates (DecompressionStream).
// ---------------------------------------------------------------------------

export class EpubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EpubError';
  }
}

export const EPUB_LIMITS = {
  /** The whole file. */
  file: 300_000_000,
  entries: 5000,
  /** One inflated entry: a chapter or a picture. */
  entry: 25_000_000,
  /** The pictures inlined into one chapter, together. */
  chapterImages: 24_000_000,
  oneImage: 8_000_000,
} as const;

// ---- The zip ----------------------------------------------------------------

interface ZipEntry { method: number; packed: number; local: number }
export interface Zip {
  names: string[];
  has(name: string): boolean;
  get(name: string, max?: number): Promise<Uint8Array | undefined>;
}

async function inflate(data: Uint8Array, max: number): Promise<Uint8Array> {
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    // The size the zip DECLARES is the attacker's word; this count is ours.
    if (size > max) { await reader.cancel().catch(() => {}); throw new EpubError('This book has a part that is far too large to open safely.'); }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

export function readZip(bytes: Uint8Array): Zip {
  if (bytes.length > EPUB_LIMITS.file) throw new EpubError('This file is too large to open here.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new EpubError('This file is not a book (it is not a zip).');
  const count = view.getUint16(end + 10, true);
  const directory = view.getUint32(end + 16, true);
  if (count === 0xffff || directory === 0xffffffff) throw new EpubError('This book is in a format too large to open here.');
  if (count > EPUB_LIMITS.entries) throw new EpubError('This book has too many parts to open safely.');

  const entries = new Map<string, ZipEntry>();
  const text = new TextDecoder();
  let p = directory;
  for (let i = 0; i < count; i += 1) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new EpubError('This book is damaged.');
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const packed = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const extra = view.getUint16(p + 30, true);
    const comment = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    if (p + 46 + nameLength > bytes.length) throw new EpubError('This book is damaged.');
    const name = text.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    // An encrypted part cannot be read; leave it out and let the book decide.
    if (!(flags & 1) && !name.endsWith('/')) entries.set(name, { method, packed, local });
    p += 46 + nameLength + extra + comment;
  }

  return {
    names: [...entries.keys()],
    has: (name) => entries.has(name),
    async get(name, max = EPUB_LIMITS.entry) {
      const e = entries.get(name);
      if (!e) return undefined;
      if (e.local + 30 > bytes.length || view.getUint32(e.local, true) !== 0x04034b50) throw new EpubError('This book is damaged.');
      const start = e.local + 30 + view.getUint16(e.local + 26, true) + view.getUint16(e.local + 28, true);
      if (start + e.packed > bytes.length) throw new EpubError('This book is damaged.');
      const data = bytes.subarray(start, start + e.packed);
      if (e.method === 0) {
        if (data.length > max) throw new EpubError('This book has a part that is far too large to open safely.');
        return data.slice();
      }
      if (e.method === 8) return inflate(data, max);
      throw new EpubError('This book uses a way of packing that is not supported.');
    },
  };
}

/** `href` as the book's own path, or null for anything that is not inside the book. */
export function resolvePath(fromFile: string, href: string): string | null {
  const clean = href.split('#')[0].split('?')[0];
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith('//')) return null;
  if (clean === '') return fromFile;
  let decoded: string;
  try { decoded = decodeURIComponent(clean); } catch { return null; }
  const parts = (decoded.startsWith('/') ? [] : fromFile.split('/').slice(0, -1)).concat(decoded.split('/'));
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') { if (out.length === 0) return null; out.pop(); } else out.push(part);
  }
  return out.join('/');
}

// ---- The book ---------------------------------------------------------------

export interface Chapter { path: string }
export interface Contents { title: string; path: string; id: string; depth: number }
export interface EpubBook {
  title: string;
  author: string;
  language: string;
  spine: Chapter[];
  contents: Contents[];
  zip: Zip;
  mime: (path: string) => string;
}

const decode = (b: Uint8Array) => new TextDecoder().decode(b);
const tag = (root: ParentNode, name: string) => Array.from((root as Document).getElementsByTagNameNS('*', name));
const words = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

function parseXml(source: string): Document {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new EpubError('This book is damaged (its table of parts cannot be read).');
  return doc;
}

export async function openEpub(blob: Blob): Promise<EpubBook> {
  if (blob.size > EPUB_LIMITS.file) throw new EpubError('This file is too large to open here.');
  const zip = readZip(new Uint8Array(await blob.arrayBuffer()));
  const container = await zip.get('META-INF/container.xml');
  if (!container) throw new EpubError('This is not an EPUB book.');
  const rootPath = tag(parseXml(decode(container)), 'rootfile')[0]?.getAttribute('full-path') ?? '';
  const opfBytes = rootPath ? await zip.get(rootPath) : undefined;
  if (!opfBytes) throw new EpubError('This book has no list of chapters.');
  const opf = parseXml(decode(opfBytes));

  const manifest = new Map<string, { path: string; type: string; props: string }>();
  for (const item of tag(opf, 'item')) {
    const id = item.getAttribute('id');
    const path = resolvePath(rootPath, item.getAttribute('href') ?? '');
    if (id && path) manifest.set(id, { path, type: item.getAttribute('media-type') ?? '', props: item.getAttribute('properties') ?? '' });
  }
  const mimeByPath = new Map([...manifest.values()].map((m) => [m.path, m.type]));

  const spine: Chapter[] = [];
  for (const ref of tag(opf, 'itemref')) {
    const m = manifest.get(ref.getAttribute('idref') ?? '');
    if (m && /x?html/i.test(m.type) && zip.has(m.path)) spine.push({ path: m.path });
  }
  if (spine.length === 0) throw new EpubError('This book has no chapters to read.');

  // Contents: the book's own list. EPUB 3 has a nav page, EPUB 2 an .ncx file.
  const contents: Contents[] = [];
  const put = (title: string, href: string, from: string, depth: number) => {
    const path = resolvePath(from, href);
    let id = href.split('#')[1] ?? '';
    try { id = decodeURIComponent(id); } catch { /* keep it as written */ }
    if (path && title) contents.push({ title, path, id, depth });
  };
  const navItem = [...manifest.values()].find((m) => m.props.split(/\s+/).includes('nav'));
  const ncxId = tag(opf, 'spine')[0]?.getAttribute('toc');
  const ncxItem = ncxId ? manifest.get(ncxId) : [...manifest.values()].find((m) => m.type === 'application/x-dtbncx+xml');
  try {
    if (navItem) {
      const html = new DOMParser().parseFromString(decode((await zip.get(navItem.path)) ?? new Uint8Array()), 'text/html');
      const nav = Array.from(html.querySelectorAll('nav')).find((n) => (n.getAttribute('epub:type') ?? '').includes('toc')) ?? html.querySelector('nav');
      const walk = (list: Element | null, depth: number) => {
        for (const li of Array.from(list?.children ?? []).filter((c) => c.tagName === 'LI')) {
          const a = li.querySelector(':scope > a');
          if (a) put(words(a.textContent), a.getAttribute('href') ?? '', navItem.path, depth);
          else { const label = words(li.querySelector(':scope > span')?.textContent); if (label) contents.push({ title: label, path: '', id: '', depth }); }
          walk(li.querySelector(':scope > ol'), depth + 1);
        }
      };
      walk(nav?.querySelector('ol') ?? null, 0);
    } else if (ncxItem) {
      const ncx = parseXml(decode((await zip.get(ncxItem.path)) ?? new Uint8Array()));
      const walk = (parent: Element, depth: number) => {
        for (const point of Array.from(parent.children).filter((c) => c.localName === 'navPoint')) {
          const label = words(tag(point, 'text')[0]?.textContent);
          const src = Array.from(point.children).find((c) => c.localName === 'content')?.getAttribute('src') ?? '';
          put(label, src, ncxItem.path, depth);
          walk(point, depth + 1);
        }
      };
      const map = tag(ncx, 'navMap')[0];
      if (map) walk(map, 0);
    }
  } catch { /* a broken contents page is not a reason to lose the book */ }
  const readable = contents.filter((c) => !c.path || spine.some((s) => s.path === c.path));
  if (readable.filter((c) => c.path).length === 0) {
    readable.length = 0;
    spine.forEach((s, i) => readable.push({ title: `Part ${i + 1}`, path: s.path, id: '', depth: 0 }));
  }

  return {
    title: words(tag(opf, 'title')[0]?.textContent),
    author: words(tag(opf, 'creator')[0]?.textContent),
    language: words(tag(opf, 'language')[0]?.textContent).replace(/[^A-Za-z-]/g, '').slice(0, 12),
    spine,
    contents: readable,
    zip,
    mime: (path) => mimeByPath.get(path) ?? '',
  };
}

// ---- A chapter, made safe ---------------------------------------------------

/** Tags a chapter may keep. Everything else is dropped; see which ones keep their words below. */
const KEEP = new Set(('p div span section article aside header footer h1 h2 h3 h4 h5 h6 blockquote pre code em strong b i u s small sub sup br hr '
  + 'ul ol li dl dt dd table thead tbody tfoot tr td th caption figure figcaption a img cite q abbr mark del ins ruby rt rp bdi bdo nav main address time var kbd samp dfn').split(' '));
/** Dropped with everything inside them: nothing in these is reading. */
const BIN = new Set('script style noscript template iframe frame frameset object embed applet audio video source track canvas map area form input button select option optgroup textarea label datalist fieldset legend meter progress output dialog title head link meta base svg math param portal'.split(' '));
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);
const SAFE_ATTR: Record<string, string[]> = {
  '*': ['id', 'lang', 'dir', 'title'],
  img: ['alt', 'width', 'height'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  ol: ['start'],
};

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export interface SafeChapter { html: string; path: string }

/** The chapter at `path`, rebuilt from the allowlist. Pictures are read out of the book and inlined. */
export async function safeChapter(book: EpubBook, path: string): Promise<SafeChapter> {
  const bytes = await book.zip.get(path);
  if (!bytes) throw new EpubError('That chapter is missing from the book.');
  const source = new DOMParser().parseFromString(decode(bytes), 'text/html');
  const out = document.implementation.createHTMLDocument('');
  let budget = EPUB_LIMITS.chapterImages;

  const image = async (href: string): Promise<string | null> => {
    const at = resolvePath(path, href);
    if (!at || !IMAGE_TYPES.has(book.mime(at))) return null;
    const data = await book.zip.get(at, EPUB_LIMITS.oneImage).catch(() => undefined);
    if (!data || data.length > budget) return null;
    budget -= data.length;
    return `data:${book.mime(at)};base64,${base64(data)}`;
  };

  const copy = async (from: Node, into: Node): Promise<void> => {
    for (const child of Array.from(from.childNodes)) {
      if (child.nodeType === 3) { into.appendChild(out.createTextNode(child.textContent ?? '')); continue; }
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      const name = el.localName.toLowerCase();
      if (name === 'svg') {
        // A cover is often an SVG wrapping one picture; keep the picture.
        const inner = el.querySelector('image');
        const src = inner?.getAttribute('href') ?? inner?.getAttribute('xlink:href');
        const uri = src ? await image(src) : null;
        if (uri) { const img = out.createElement('img'); img.setAttribute('src', uri); img.setAttribute('alt', ''); into.appendChild(img); }
        continue;
      }
      if (BIN.has(name)) continue;
      if (!KEEP.has(name)) { await copy(el, into); continue; } // unknown wrapper: keep its words
      const node = out.createElement(name);
      for (const a of [...SAFE_ATTR['*'], ...(SAFE_ATTR[name] ?? [])]) {
        const v = el.getAttribute(a);
        if (v !== null && v.length <= 300) node.setAttribute(a, v);
      }
      if (name === 'img') {
        const uri = await image(el.getAttribute('src') ?? '');
        if (!uri) { const alt = words(el.getAttribute('alt')); if (alt) into.appendChild(out.createTextNode(alt)); continue; }
        node.setAttribute('src', uri);
        if (!node.hasAttribute('alt')) node.setAttribute('alt', '');
      } else if (name === 'a') {
        // Only links inside the book go anywhere, and the app, not the page, follows them.
        const href = el.getAttribute('href') ?? '';
        const at = resolvePath(path, href);
        if (at !== null) node.setAttribute('data-to', `${at}#${href.split('#')[1] ?? ''}`);
      }
      into.appendChild(node);
      await copy(el, node);
    }
  };
  await copy(source.body, out.body);
  return { html: out.body.innerHTML, path };
}

/** The page a chapter is shown in: the policy that blocks everything, then the reading styles. */
export function chapterDocument(html: string, language: string, css: string): string {
  const lang = language || 'en';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">`
    + `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><main id="page">${html}</main></body></html>`;
}

'use client';

// Reading an EPUB inside the app, full screen, like a book.
//
// A book kept on the device could only be downloaded. This opens it (lib/epub.ts
// reads the zip and makes each chapter safe), and shows one chapter at a time in
// a sandboxed frame: pages side by side (two on a wide screen) turned with a
// tap, a swipe, a key or a button, or one long scroll. Nothing in the book runs
// and nothing in it is fetched; see lib/epub.ts for the three layers that hold.
//
// What is remembered, on this device only: the size, colour and style you chose,
// and where you stopped in each book.

import { useCallback, useEffect, useRef, useState } from 'react';
import { CloseGlyph } from '@/components/Glyph';
import { settleIn } from '@/lib/motion';
import { chapterDocument, EpubError, openEpub, safeChapter, type EpubBook } from '@/lib/epub';

const THEMES = {
  paper: { label: 'Paper', bg: '#ffffff', fg: '#1b1b1f', link: '#0b57d0', rule: '#c9ccd3' },
  sepia: { label: 'Sepia', bg: '#f4ecd8', fg: '#3b2f1f', link: '#7a3e00', rule: '#d3c4a2' },
  night: { label: 'Night', bg: '#14181f', fg: '#d9dee7', link: '#8ab4f8', rule: '#3a4150' },
} as const;
type ThemeKey = keyof typeof THEMES;
const THEME_ORDER: ThemeKey[] = ['paper', 'sepia', 'night'];
const SIZES = [15, 17, 19, 21, 24, 28, 32] as const;

interface Prefs { size: number; theme: ThemeKey; serif: boolean; mode: 'book' | 'scroll' }
const DEFAULT_PREFS: Prefs = { size: 2, theme: 'paper', serif: true, mode: 'book' };
const PREFS_KEY = 'hb-epub-prefs';

function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    return {
      size: Number.isInteger(raw.size) && raw.size! >= 0 && raw.size! < SIZES.length ? raw.size! : DEFAULT_PREFS.size,
      theme: raw.theme && raw.theme in THEMES ? raw.theme : DEFAULT_PREFS.theme,
      serif: typeof raw.serif === 'boolean' ? raw.serif : DEFAULT_PREFS.serif,
      mode: raw.mode === 'scroll' ? 'scroll' : 'book',
    };
  } catch { return DEFAULT_PREFS; }
}

/** The reading styles of a chapter. Layout numbers arrive as variables so the frame never reloads to resize. */
const READING_CSS = `
html{margin:0;padding:0;background:var(--bg);color:var(--fg);-webkit-text-size-adjust:100%}
body{margin:0;font:var(--size)/1.65 var(--font);overflow-wrap:break-word;hyphens:auto}
html[data-mode=book]{overflow:hidden;height:100%}
html[data-mode=book] body{height:100%}
html[data-mode=book] #page{box-sizing:border-box;height:100vh;height:100dvh;padding:28px var(--m);column-width:var(--col);column-gap:var(--gap);column-fill:auto}
html[data-mode=scroll] #page{max-width:40rem;margin:0 auto;padding:28px var(--m) 96px}
p{margin:0 0 .9em}
h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.1em 0 .5em;break-after:avoid}
h1{font-size:1.6em}h2{font-size:1.35em}h3{font-size:1.15em}
img{display:block;max-width:100%;max-height:calc(100vh - 70px);max-height:calc(100dvh - 70px);height:auto;margin:.6em auto;object-fit:contain;break-inside:avoid}
a[data-to]{color:var(--link);text-decoration:underline;cursor:pointer}
blockquote{margin:1em 1.2em;padding-left:.8em;border-left:3px solid var(--rule)}
pre{white-space:pre-wrap;font:.85em ui-monospace,Menlo,Consolas,monospace}
table{border-collapse:collapse;max-width:100%}td,th{border:1px solid var(--rule);padding:.25em .5em}
hr{border:0;border-top:1px solid var(--rule);margin:1.4em 0}
::selection{background:var(--link);color:var(--bg)}
`;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
type Want = { kind: 'start' } | { kind: 'end' } | { kind: 'frac'; value: number } | { kind: 'id'; value: string };

function Btn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest}
      className={`tap-sm shrink-0 rounded-full px-3 text-sm font-bold hover:bg-white/10 disabled:opacity-40 ${rest.className ?? ''}`}>
      {children}
    </button>
  );
}

export function EpubReader({ blob, title, bookId, onClose }: { blob: Blob; title: string; bookId: string; onClose: () => void }) {
  const [book, setBook] = useState<EpubBook | null>(null);
  const [error, setError] = useState('');
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [chapter, setChapter] = useState(0);
  const [src, setSrc] = useState('');
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [menu, setMenu] = useState<'' | 'contents' | 'look'>('');
  const frame = useRef<HTMLIFrameElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const want = useRef<Want>({ kind: 'start' });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const live = useRef({ book, chapter, page, pages, prefs, menu });
  live.current = { book, chapter, page, pages, prefs, menu };
  const positionKey = `hb-epub:${bookId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)}`;

  // Open the book and go back to where it was left.
  useEffect(() => {
    setPrefs(readPrefs());
    let alive = true;
    (async () => {
      try {
        const opened = await openEpub(blob);
        if (!alive) return;
        let at = 0;
        try {
          const saved = JSON.parse(localStorage.getItem(positionKey) ?? 'null') as { c?: number; f?: number } | null;
          if (saved && Number.isInteger(saved.c) && saved.c! >= 0 && saved.c! < opened.spine.length) {
            at = saved.c!;
            want.current = { kind: 'frac', value: clamp(Number(saved.f) || 0, 0, 1) };
          }
        } catch { /* a private window */ }
        setBook(opened);
        setChapter(at);
      } catch (e) {
        if (alive) setError(e instanceof EpubError ? `${e.message} Try Download instead.` : 'This book could not be opened here. Try Download, or ask whoever sent it for a fresh copy.');
      }
    })();
    return () => { alive = false; };
  }, [blob, positionKey]);

  // Make the chapter safe and hand it to the frame as text.
  useEffect(() => {
    if (!book) return undefined;
    let alive = true;
    setReady(false);
    safeChapter(book, book.spine[chapter].path)
      .then((c) => { if (alive) setSrc(chapterDocument(c.html, book.language, READING_CSS)); })
      .catch((e) => { if (alive) setError(e instanceof EpubError ? e.message : 'That chapter could not be shown.'); });
    return () => { alive = false; };
  }, [book, chapter]);

  const remember = useCallback((p: number, total: number, frameEl: HTMLIFrameElement | null) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        let f = total > 1 ? p / total : 0;
        const root = frameEl?.contentDocument?.documentElement;
        if (live.current.prefs.mode === 'scroll' && root) f = root.scrollTop / Math.max(1, root.scrollHeight - root.clientHeight);
        localStorage.setItem(positionKey, JSON.stringify({ c: live.current.chapter, f: Number(f.toFixed(4)) }));
      } catch { /* a private window */ }
    }, 400);
  }, [positionKey]);

  /** Size the pages to the frame, then put the reader where it was meant to be. */
  const layout = useCallback((keep: boolean) => {
    const f = frame.current;
    const doc = f?.contentDocument;
    if (!f || !doc) return;
    const root = doc.documentElement;
    const { prefs: p } = live.current;
    const W = Math.round(f.clientWidth);
    if (W < 50) return;
    const before = root.scrollLeft / W / Math.max(1, live.current.pages);
    const beforeY = root.scrollTop / Math.max(1, root.scrollHeight - root.clientHeight);
    const t = THEMES[p.theme];
    const m = clamp(Math.round(W * 0.06), 16, 56);
    const two = p.mode === 'book' && W >= 900;
    const set = (k: string, v: string) => root.style.setProperty(k, v);
    set('--bg', t.bg); set('--fg', t.fg); set('--link', t.link); set('--rule', t.rule);
    set('--size', `${SIZES[p.size]}px`);
    set('--font', p.serif ? "Georgia, 'Times New Roman', serif" : "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif");
    set('--m', `${m}px`); set('--gap', `${2 * m}px`);
    set('--col', `${two ? (W - 4 * m) / 2 : W - 2 * m}px`);
    root.setAttribute('data-mode', p.mode);

    const w = want.current;
    if (p.mode === 'book') {
      const total = Math.max(1, Math.ceil((root.scrollWidth - 2) / W));
      let at = keep ? Math.round(before * total) : 0;
      if (!keep) {
        if (w.kind === 'end') at = total - 1;
        else if (w.kind === 'frac') at = Math.floor(w.value * total);
        else if (w.kind === 'id') {
          const el = doc.getElementById(w.value);
          if (el) at = Math.floor((el.getBoundingClientRect().left + root.scrollLeft) / W);
        }
      }
      at = clamp(at, 0, total - 1);
      root.scrollLeft = at * W;
      setPages(total); setPage(at);
      remember(at, total, f);
    } else {
      const room = Math.max(1, root.scrollHeight - root.clientHeight);
      if (keep) root.scrollTop = beforeY * room;
      else if (w.kind === 'end') root.scrollTop = room;
      else if (w.kind === 'frac') root.scrollTop = w.value * room;
      else if (w.kind === 'id') doc.getElementById(w.value)?.scrollIntoView();
      else root.scrollTop = 0;
      setPages(1); setPage(0);
      remember(0, 1, f);
    }
    if (!keep) want.current = { kind: 'start' };
    setReady(true);
  }, [remember]);

  const jump = useCallback((index: number, to: Want) => {
    const { book: b, chapter: c } = live.current;
    if (!b || index < 0 || index >= b.spine.length) return;
    want.current = to;
    if (index === c) layout(false); else setChapter(index);
  }, [layout]);

  const animate = (dir: 1 | -1) => settleIn(frame.current, dir === 1 ? 'forward' : 'back');

  /** One step: a page in a book, a chapter when scrolling. */
  const turn = useCallback((dir: 1 | -1) => {
    const { book: b, chapter: c, page: p, pages: total, prefs: pr } = live.current;
    const root = frame.current?.contentDocument?.documentElement;
    const W = Math.round(frame.current?.clientWidth ?? 0);
    if (!b || !root || !W) return;
    if (pr.mode === 'book') {
      if (dir === 1 && p < total - 1) { root.scrollLeft = (p + 1) * W; setPage(p + 1); remember(p + 1, total, frame.current); animate(dir); return; }
      if (dir === -1 && p > 0) { root.scrollLeft = (p - 1) * W; setPage(p - 1); remember(p - 1, total, frame.current); animate(dir); return; }
    }
    if (dir === 1) jump(c + 1, { kind: 'start' }); else jump(c - 1, pr.mode === 'book' ? { kind: 'end' } : { kind: 'start' });
    animate(dir);
  }, [jump, remember]);

  const follow = useCallback((to: string) => {
    const b = live.current.book;
    if (!b) return;
    const at = to.lastIndexOf('#');
    const path = at < 0 ? to : to.slice(0, at);
    let id = at < 0 ? '' : to.slice(at + 1);
    try { id = decodeURIComponent(id); } catch { /* as written */ }
    const index = b.spine.findIndex((s) => s.path === path);
    if (index >= 0) jump(index, id ? { kind: 'id', value: id } : { kind: 'start' });
  }, [jump]);

  // Hands on the page: a tap at either edge turns it, a swipe turns it, links stay in the book.
  const attach = useCallback(() => {
    const f = frame.current;
    const doc = f?.contentDocument;
    if (!f || !doc) return;
    let from: { x: number; y: number } | null = null;
    doc.addEventListener('click', (e) => {
      const a = (e.target as Element | null)?.closest?.('a[data-to]');
      if (a) { e.preventDefault(); follow(a.getAttribute('data-to') ?? ''); return; }
      if (live.current.prefs.mode !== 'book' || doc.getSelection()?.toString()) return;
      const x = e.clientX / Math.max(1, f.clientWidth);
      if (x < 0.25) turn(-1); else if (x > 0.75) turn(1);
    });
    doc.addEventListener('touchstart', (e) => { const t = e.touches[0]; from = { x: t.clientX, y: t.clientY }; }, { passive: true });
    doc.addEventListener('touchend', (e) => {
      const t = e.changedTouches[0];
      const start = from; from = null;
      if (!start || !t || live.current.prefs.mode !== 'book') return;
      const dx = t.clientX - start.x;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(t.clientY - start.y) * 1.5) turn(dx < 0 ? 1 : -1);
    }, { passive: true });
    doc.addEventListener('keydown', (e) => keyRef.current(e));
    doc.addEventListener('scroll', () => { if (live.current.prefs.mode === 'scroll') remember(0, 1, f); }, { passive: true });
  }, [follow, turn, remember]); // eslint-disable-line @typescript-eslint/no-use-before-define

  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (live.current.menu) setMenu(''); else onClose();
      return;
    }
    if (live.current.prefs.mode !== 'book') return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) { e.preventDefault(); turn(1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) { e.preventDefault(); turn(-1); }
  };
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    closeRef.current?.focus();
    const on = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', on);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', on); document.body.style.overflow = before; clearTimeout(saveTimer.current); };
  }, []);

  // A new look or a new size keeps your place; a turned phone does too.
  useEffect(() => { if (ready) layout(true); }, [prefs, layout]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = holder.current;
    if (!el) return undefined;
    const watch = new ResizeObserver(() => { if (frame.current?.contentDocument?.documentElement) layout(true); });
    watch.observe(el);
    return () => watch.disconnect();
  }, [layout]);

  const choose = (patch: Partial<Prefs>) => setPrefs((p) => {
    const next = { ...p, ...patch };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* a private window */ }
    return next;
  });

  const onLoad = () => {
    attach();
    layout(false);
    const doc = frame.current?.contentDocument;
    // A picture that arrives late can change the page count.
    for (const img of Array.from(doc?.images ?? [])) if (!img.complete) img.addEventListener('load', () => layout(true), { once: true });
  };

  const t = THEMES[prefs.theme];
  const last = book ? book.spine.length - 1 : 0;
  const linked = book ? book.contents.filter((c) => c.path) : [];
  // The first entry for this chapter, or the nearest one before it.
  let here = 0;
  if (book) {
    const at = (c: { path: string }) => book.spine.findIndex((x) => x.path === c.path);
    const exact = linked.findIndex((c) => at(c) === chapter);
    if (exact >= 0) here = exact;
    else linked.forEach((c, i) => { if (at(c) < chapter) here = i; });
  }
  const chapterName = linked[here]?.title ?? `Part ${chapter + 1}`;
  const book_ = prefs.mode === 'book';
  const atStart = chapter === 0 && (!book_ || page === 0);
  const atEnd = chapter === last && (!book_ || page >= pages - 1);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Reading ${title}`} className="fixed inset-0 z-[80] flex flex-col bg-slate-800" data-epub-reader>
      <div className="flex items-center gap-1 bg-navy px-2 py-1.5 pt-[calc(0.375rem+env(safe-area-inset-top,0px))] text-white">
        {book && <Btn onClick={() => setMenu(menu === 'contents' ? '' : 'contents')} aria-expanded={menu === 'contents'} data-epub-contents>Contents</Btn>}
        <p className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{book?.title || title}</p>
        {book && <Btn onClick={() => setMenu(menu === 'look' ? '' : 'look')} aria-expanded={menu === 'look'} aria-label="Text size and look" data-epub-look>Aa</Btn>}
        {book && <Btn onClick={() => choose({ mode: book_ ? 'scroll' : 'book' })} aria-pressed={book_} data-epub-mode>{book_ ? 'Scroll' : '\u{1F4D6} Book'}</Btn>}
        <button ref={closeRef} type="button" className="tap-sm grid w-11 place-items-center rounded-full hover:bg-white/10" onClick={onClose} aria-label="Close the reader">
          <CloseGlyph size={20} />
        </button>
      </div>

      {menu === 'look' && (
        <div className="flex flex-wrap items-center justify-center gap-1 bg-navy/95 px-2 pb-2 text-white" data-epub-look-panel>
          <Btn onClick={() => choose({ size: Math.max(0, prefs.size - 1) })} disabled={prefs.size <= 0} aria-label="Smaller text">A&minus;</Btn>
          <Btn onClick={() => choose({ size: Math.min(SIZES.length - 1, prefs.size + 1) })} disabled={prefs.size >= SIZES.length - 1} aria-label="Larger text">A+</Btn>
          {THEME_ORDER.map((k) => (
            <Btn key={k} onClick={() => choose({ theme: k })} aria-pressed={prefs.theme === k} className="aria-pressed:bg-white/20">
              <span aria-hidden className="mr-1.5 inline-block h-3 w-3 rounded-full align-[-1px] ring-1 ring-white/60" style={{ background: THEMES[k].bg }} />{THEMES[k].label}
            </Btn>
          ))}
          <Btn onClick={() => choose({ serif: !prefs.serif })} aria-label={prefs.serif ? 'Use plain letters' : 'Use book letters'}>{prefs.serif ? 'Serif' : 'Plain'}</Btn>
        </div>
      )}

      <div ref={holder} className="relative min-h-0 flex-1" style={{ background: t.bg }}>
        {error ? (
          <p role="alert" className="mx-auto mt-10 max-w-md rounded-2xl bg-white p-4 text-center text-navy">{error}</p>
        ) : !book || !src ? (
          <p role="status" className="mt-10 text-center" style={{ color: t.fg }}>Opening…</p>
        ) : (
          <iframe
            ref={frame}
            title={`${chapterName}, ${book.title || title}`}
            // No scripts, forms, popups or navigation: only same-origin, so the app (not the book) can turn its pages.
            sandbox="allow-same-origin"
            srcDoc={src}
            onLoad={onLoad}
            className="block h-full w-full border-0"
            style={{ opacity: ready ? 1 : 0 }}
            data-epub-frame
          />
        )}

        {menu === 'contents' && book && (
          <div className="absolute inset-0 z-10 flex" data-epub-contents-panel>
            <nav aria-label="Contents" className="h-full w-[min(22rem,88%)] overflow-auto bg-white p-2 text-navy shadow-xl">
              <p className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-500">Contents</p>
              <ul>
                {book.contents.map((c, i) => {
                  const idx = c.path ? book.spine.findIndex((s) => s.path === c.path) : -1;
                  const current = c.path !== '' && linked[here] === c;
                  return (
                    <li key={`${c.path}#${c.id}-${i}`}>
                      {idx < 0 ? (
                        <p className="px-3 py-2 text-sm font-bold text-gray-600" style={{ paddingLeft: 12 + c.depth * 16 }}>{c.title}</p>
                      ) : (
                        <button type="button" aria-current={current ? 'true' : undefined}
                          className="tap block w-full rounded-xl px-3 text-left text-base hover:bg-slate-100 aria-[current]:bg-slate-100 aria-[current]:font-bold"
                          style={{ paddingLeft: 12 + c.depth * 16 }}
                          onClick={() => { setMenu(''); jump(idx, c.id ? { kind: 'id', value: c.id } : { kind: 'start' }); }}>
                          {c.title}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </nav>
            <button type="button" className="h-full flex-1 bg-black/40" aria-label="Close contents" onClick={() => setMenu('')} />
          </div>
        )}
      </div>

      {book && !error && (
        <div className="flex items-center justify-between gap-2 bg-navy px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] text-white" data-epub-bar>
          <button type="button" className="tap rounded-full bg-white/10 px-5 text-base font-bold disabled:opacity-40" onClick={() => turn(-1)} disabled={atStart}>
            {book_ ? 'Previous' : 'Back'}
          </button>
          <span className="line-clamp-2 min-w-0 flex-1 text-center text-xs leading-tight tabular-nums text-white/85" aria-live="polite" data-epub-place>
            {chapterName} &middot; {book_ ? `page ${page + 1} of ${pages}` : `part ${chapter + 1} of ${last + 1}`}
          </span>
          <button type="button" className="tap rounded-full bg-white/10 px-5 text-base font-bold disabled:opacity-40" onClick={() => turn(1)} disabled={atEnd}>
            {book_ ? 'Next' : 'Next part'}
          </button>
        </div>
      )}
    </div>
  );
}

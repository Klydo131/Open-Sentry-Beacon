'use client';

// The other apps a church already uses, one tap away.
//
// ---------------------------------------------------------------------------
// WHAT THIS ROOM IS FOR. Asked for directly: the Bible a congregation reads,
// the hymnal they sing from, the study guide -- "when they tap or click it, it
// automatically goes to the app destination", on a phone or a desktop, with no
// thought about which.
//
// HOW THE "OPENS THE APP" PART WORKS, SINCE IT LOOKS LIKE IT NEEDS SOMETHING
// CLEVER AND DOES NOT. A plain https link to an app's own domain is opened by
// the installed app on both iOS and Android -- Universal Links and App Links --
// and by the browser when the app is not installed. A custom scheme like
// `hymnal://` does the opposite: it works for the people who already have it
// and shows everybody else an error page. So these are ordinary links and the
// platform does the routing. Nothing here knows what a phone is.
//
// WHY THE LIST IS THE CHURCH'S AND NOT OURS. Every congregation uses different
// things, and the addresses could not be verified from the build environment --
// its network refuses those domains. Anything shipped hard-coded would have
// been an address written from memory and handed to a congregation untested,
// and a dead link is a dead end at the moment somebody reached for scripture.
// Leadership pastes what the church actually uses.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState } from '@/components/ui';
import { safeExternalUrl } from '@/lib/url';
import { useLiveSession } from '@/lib/live/session';
import { useKeepUp, KEEP_UP_APPS } from '@/lib/live/keep-up';
import { Notice, errorText } from '@/components/live/shared';
import * as live from '@/lib/live/data';

export default function AppsPage() {
  const { profile } = useLiveSession();
  const [rows, setRows] = useState<live.ChurchApp[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(false);

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [blurb, setBlurb] = useState('');
  const [icon, setIcon] = useState('');

  // Leadership curates; everybody opens. The same split the library uses.
  const canEdit = profile?.role === 'admin' || profile?.role === 'executive';

  const load = useCallback(async () => {
    try {
      setRows(await live.listChurchApps());
      setError('');
    } catch (cause) {
      setRows([]);
      setError(errorText(cause));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Somebody else adding an app should appear here without a reload.
  useKeepUp(KEEP_UP_APPS, load);

  const add = async () => {
    setBusy('add'); setError('');
    try {
      await live.addChurchApp({ name, url, blurb, icon, sortOrder: rows?.length ?? 0 });
      setName(''); setUrl(''); setBlurb(''); setIcon(''); setOpen(false);
      await load();
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(''); }
  };

  const remove = async (app: live.ChurchApp) => {
    if (!confirm(`Take ${app.name} out of this room? The app itself is not affected.`)) return;
    setBusy(app.id); setError('');
    try { await live.removeChurchApp(app.id); await load(); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(''); }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-teal-800/10 bg-gradient-to-r from-teal-50 via-white to-sky-50 p-5 sm:p-6">
          <div className="flex flex-wrap items-start gap-3">
            <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-700 text-2xl shadow-sm">📱</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal-700">Apps</p>
              <h1 className="mt-0.5 text-2xl font-extrabold text-navy">The apps we use</h1>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">
                Tap one and it opens the app on your phone if you have it, or the website if you do not.
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {error && <Notice tone="error">{error}</Notice>}

          {canEdit && (
            <div className="mb-5">
              {!open ? (
                <Button variant="gold" onClick={() => setOpen(true)}>Add an app</Button>
              ) : (
                <div className="grid gap-3 rounded-2xl bg-slate-50 p-3 sm:p-4">
                  <p className="text-sm font-bold text-navy">Add an app</p>
                  <label className="sr-only" htmlFor="app-name">What it is called</label>
                  <input
                    id="app-name" value={name} onChange={(e) => setName(e.target.value)}
                    maxLength={80} placeholder="What it is called"
                    className="tap w-full rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600"
                  />
                  <label className="sr-only" htmlFor="app-url">Address</label>
                  <input
                    id="app-url" value={url} onChange={(e) => setUrl(e.target.value)}
                    inputMode="url" placeholder="https://…"
                    className="tap w-full rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600"
                  />
                  {/* SAID WHERE THE DECISION IS MADE. The address is the one
                      field somebody can get subtly wrong, and the failure only
                      shows up on a stranger's phone. */}
                  <p className="text-xs leading-relaxed text-gray-500">
                    Use the app&rsquo;s own web address, starting with <strong>https://</strong>. On a phone that
                    opens the installed app; on a computer it opens the site. An address
                    like <code>hymnal://</code> only works for people who already have it.
                  </p>
                  <label className="sr-only" htmlFor="app-blurb">What it is for</label>
                  <input
                    id="app-blurb" value={blurb} onChange={(e) => setBlurb(e.target.value)}
                    maxLength={200} placeholder="One line: what it is for (optional)"
                    className="tap w-full rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600"
                  />
                  <label className="sr-only" htmlFor="app-icon">An emoji for the tile</label>
                  <input
                    id="app-icon" value={icon} onChange={(e) => setIcon(e.target.value)}
                    maxLength={8} placeholder="An emoji, e.g. 📖 (optional)"
                    className="tap w-full rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="gold" disabled={busy === 'add' || !name.trim() || !url.trim()} onClick={() => void add()}>
                      {busy === 'add' ? 'Saving…' : 'Add it'}
                    </Button>
                    <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {rows === null && <p className="text-sm text-gray-400">Loading…</p>}

          {rows !== null && rows.length === 0 && (
            <EmptyState
              title="Nothing here yet"
              hint={canEdit
                ? 'Add the Bible, the hymnal, or anything else your church already opens on a phone.'
                : 'Your church has not added any apps yet.'}
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {(rows ?? []).map((app) => {
              // THE GUARD IS NOT THE COLUMN'S CHECK REPEATED FOR NOTHING. The
              // database refuses anything that is not https, and this refuses
              // anything that does not PARSE as a URL -- so a row written before
              // a constraint, or by a future path that forgets one, still cannot
              // put an unparseable href in front of somebody.
              const href = safeExternalUrl(app.url);
              if (!href) return null;
              return (
                <div key={app.id} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3"
                  >
                    <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-2xl shadow-sm">
                      {app.icon || '📱'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-navy underline underline-offset-2">{app.name}</span>
                      {app.blurb && <span className="mt-0.5 block text-sm text-gray-600">{app.blurb}</span>}
                    </span>
                  </a>
                  {canEdit && (
                    <button
                      type="button"
                      disabled={busy === app.id}
                      onClick={() => void remove(app)}
                      className="mt-2 text-xs font-semibold text-red-700 underline underline-offset-2 disabled:opacity-40"
                    >
                      Take it out
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}

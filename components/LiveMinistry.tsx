'use client';

// The rest of the ministry, live: recommendations, a Guide's private tools, and
// lesson series. See migration 0011.
//
// WHAT IS PRIVATE HERE, AND FROM WHOM. Notes and follow-ups belong to the Guide
// who wrote them and to nobody else — not the Explorer they are about, not the
// Director above them. A private note a leader can read is not a private note,
// so that is a policy (`author_id = auth.uid()`) rather than a screen that
// declines to render.

import { useCallback, useEffect, useState } from 'react';
import { useKeepUp, KEEP_UP_FOLLOW_UPS } from '@/lib/live/keep-up';
import * as live from '@/lib/live/data';
import { copyText } from '@/lib/share';
import { Button, Card } from '@/components/ui';
import { Linked } from '@/components/Linked';
import { humanError } from '@/lib/live/errors';

const message = (cause: unknown) =>
  humanError(cause, 'Something went wrong.');

function Err({ msg }: { msg: string }) {
  if (!msg) return null;
  return <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">{msg}</p>;
}

// ---------------------------------------------------------------------------
// A Guide puts somebody forward. They cannot invite; a Director decides.
// ---------------------------------------------------------------------------
export function LiveRecommend() {
  const [rows, setRows] = useState<live.Recommendation[] | null>(null);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    try { setRows(await live.listRecommendations()); setError(''); }
    catch (cause) { setRows([]); setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_FOLLOW_UPS, load);

  const submit = async () => {
    if (!name.trim() || !email.trim() || busy) return;
    setBusy(true); setError(''); setFlash('');
    try {
      await live.recommendSomeone({ full_name: name, email, note });
      setName(''); setEmail(''); setNote('');
      setFlash('Sent to your Director.');
      await load();
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  };

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">🤝 Recommend someone</h2>
      <p className="mt-1 text-sm text-gray-500">
        You put the name forward and your Director sends the invitation. Guides do not invite people directly.
      </p>
      <Err msg={error} />
      {flash && <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">{flash}</p>}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name"
          className="rounded-xl border border-gray-300 px-3 py-2" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email"
          className="rounded-xl border border-gray-300 px-3 py-2" />
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        placeholder="How do you know them? (optional)"
        className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2" />
      <div className="mt-3"><Button onClick={submit} disabled={!name.trim() || !email.trim() || busy}>Recommend</Button></div>

      <div className="mt-4 space-y-2">
        {rows?.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-xl bg-gray-50 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-navy">{r.full_name}</p>
              <p className="truncate text-xs text-gray-500">{r.email}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
              r.status === 'pending' ? 'bg-gray-200 text-gray-700'
              : r.status === 'invited' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {r.status.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** The Director's side of the same table. */
export function LiveRecommendationsForDirector({ alone = false }: { alone?: boolean }) {
  const [rows, setRows] = useState<live.Recommendation[] | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const load = useCallback(async () => {
    try { setRows(await live.listRecommendations()); setError(''); }
    catch (cause) { setRows([]); setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_FOLLOW_UPS, load);

  const decide = async (id: string, status: 'invited' | 'declined', row?: live.Recommendation) => {
    setError('');
    try { await live.decideRecommendation(id, status, row); await load(); }
    catch (cause) { setError(message(cause)); }
  };

  const pending = rows?.filter((r) => r.status === 'pending') ?? [];
  const decided = rows?.filter((r) => r.status !== 'pending') ?? [];

  // copyText, not navigator.clipboard directly. The clipboard API throws over
  // plain http and fails silently on Safari, and lib/share.ts already carries
  // the fallback that works everywhere -- a guardrail forbids the direct call
  // precisely so a second, weaker copy of that fallback cannot appear.
  const copy = async (r: live.Recommendation) => {
    if (await copyText(r.email)) {
      setCopied(r.id);
      window.setTimeout(() => setCopied(''), 1500);
    }
  };
  // Vanishing is right for a panel among panels and wrong when this is the
  // whole room: a tab somebody opened on purpose must say why it is empty.
  if (rows !== null && pending.length === 0 && !error && !alone) return null;
  const empty = rows !== null && pending.length === 0 && !error;

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">🤝 Recommended by your Guides</h2>
      <p className="mt-1 text-sm text-gray-500">A Guide has met somebody. The decision is yours.</p>
      <Err msg={error} />
      {empty && (
        <p className="mt-3 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
          No Guide has put a name forward. When one does, the person appears here
          and you decide whether to invite them.
        </p>
      )}
      <div className="mt-3 space-y-2">
        {pending.map((r) => (
          <div key={r.id} className="rounded-xl bg-gray-50 p-3">
            <p className="font-semibold text-navy">{r.full_name}</p>
            <p className="text-xs text-gray-500">{r.email}</p>
            {r.note && <p className="mt-1 text-sm italic text-gray-600">&ldquo;{r.note}&rdquo;</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button onClick={() => decide(r.id, 'invited', r)}>Invite them</Button>
              <Button variant="ghost" onClick={() => decide(r.id, 'declined')}>Not now</Button>
              {/* THE ADDRESS HAS TO BE TAKEABLE, not just readable. Asked for
                  after deciding a recommendation twice made the card vanish and
                  took the only copy of the address with it, leaving no way to
                  invite the person by hand. */}
              <Button variant="ghost" onClick={() => void copy(r)}>
                {copied === r.id ? 'Copied' : 'Copy address'}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* DECIDED ONES ARE KEPT, NOT ERASED.
          A decision used to remove the row from every screen in the app, so a
          Guide's recommendation and the address on it were gone the moment
          anybody pressed a button -- including by accident. Asked for directly:
          "if they accidentally delete it, the info can saved at some point".
          Folded away, because the pending ones are the work. */}
      {decided.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-gray-600">
            Already decided ({decided.length})
          </summary>
          <div className="mt-2 space-y-2">
            {decided.map((r) => (
              <div key={r.id} className="rounded-xl bg-gray-50 p-3">
                <p className="font-semibold text-navy">{r.full_name}</p>
                <p className="text-xs text-gray-500">{r.email}</p>
                {r.note && <p className="mt-1 text-sm italic text-gray-600">&ldquo;{r.note}&rdquo;</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-gray-600 ring-1 ring-gray-200">
                    {r.status === 'invited' ? 'Invited' : 'Not now'}
                  </span>
                  <Button variant="ghost" onClick={() => void copy(r)}>
                    {copied === r.id ? 'Copied' : 'Copy address'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The Guide's own reminders. Private to them.
// ---------------------------------------------------------------------------
export function LiveFollowUps({ pairings }: { pairings: { id: string; ds_name: string }[] }) {
  const [rows, setRows] = useState<live.FollowUp[] | null>(null);
  const [title, setTitle] = useState(''); const [pid, setPid] = useState('');
  const [due, setDue] = useState(''); const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setRows(await live.listFollowUps()); setError(''); }
    catch (cause) { setRows([]); setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_FOLLOW_UPS, load);
  useEffect(() => { if (!pid && pairings[0]) setPid(pairings[0].id); }, [pairings, pid]);

  const act = async (fn: () => Promise<void>) => {
    setError('');
    try { await fn(); await load(); } catch (cause) { setError(message(cause)); }
  };

  const open = rows?.filter((r) => !r.done_at) ?? [];
  const nameOf = (id: string) => pairings.find((p) => p.id === id)?.ds_name ?? '';

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">✅ Your reminders</h2>
      <p className="mt-1 text-sm text-gray-500">Only you can see these. Not your Explorer, not your Director.</p>
      <Err msg={error} />

      {pairings.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Check in with…"
            className="rounded-xl border border-gray-300 px-3 py-2" />
          <select value={pid} onChange={(e) => setPid(e.target.value)} className="rounded-xl border border-gray-300 px-3 py-2">
            {pairings.map((p) => <option key={p.id} value={p.id}>{p.ds_name}</option>)}
          </select>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
            className="rounded-xl border border-gray-300 px-3 py-2" />
          <Button disabled={!title.trim() || !pid}
            onClick={() => act(async () => { await live.addFollowUp(pid, title, due); setTitle(''); setDue(''); })}>
            Add
          </Button>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {open.length === 0 && rows !== null && <p className="text-sm text-gray-400">Nothing outstanding.</p>}
        {open.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-xl bg-gray-50 p-3">
            <input type="checkbox" onChange={() => act(() => live.toggleFollowUp(r.id, true))} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-navy">{r.title}</p>
              <p className="text-xs text-gray-500">
                {nameOf(r.pairing_id)}{r.due_on ? ` · due ${r.due_on}` : ''}
              </p>
            </div>
            <button onClick={() => act(() => live.deleteFollowUp(r.id))} className="text-xs font-semibold text-red-700 underline">
              Remove
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Private notes about one Explorer, for their Guide only. */
export function LiveNotes({ pairingId }: { pairingId: string }) {
  const [rows, setRows] = useState<live.SeekerNote[] | null>(null);
  const [body, setBody] = useState(''); const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setRows(await live.listNotes(pairingId)); setError(''); }
    catch (cause) { setRows([]); setError(message(cause)); }
  }, [pairingId]);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_FOLLOW_UPS, load);

  const act = async (fn: () => Promise<void>) => {
    setError('');
    try { await fn(); await load(); } catch (cause) { setError(message(cause)); }
  };

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">📓 Your private notes</h2>
      <p className="mt-1 text-sm text-gray-500">Nobody else can read these, not even your Director.</p>
      <Err msg={error} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3}
        placeholder="What would help you remember?"
        className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2" />
      <div className="mt-2">
        <Button disabled={!body.trim()} onClick={() => act(async () => { await live.addNote(pairingId, body); setBody(''); })}>
          Save note
        </Button>
      </div>
      <div className="mt-4 space-y-2">
        {rows?.map((n) => (
          <div key={n.id} className="rounded-xl bg-gray-50 p-3">
            <p className="whitespace-pre-wrap text-sm text-gray-700">{n.body}</p>
            <button onClick={() => act(() => live.deleteNote(n.id))} className="mt-1 text-xs font-semibold text-red-700 underline">
              Delete
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Lesson series: the church writes them, a Guide assigns them, an Explorer
// walks them.
// ---------------------------------------------------------------------------
export function LiveLessonSeries({ manage = false }: { manage?: boolean }) {
  const [rows, setRows] = useState<live.LessonSeries[] | null>(null);
  const [title, setTitle] = useState(''); const [topic, setTopic] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setRows(await live.listLessonSeries()); setError(''); }
    catch (cause) { setRows([]); setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_FOLLOW_UPS, load);

  const byTopic = (rows ?? []).reduce<Record<string, live.LessonSeries[]>>((acc, s) => {
    (acc[s.topic] ??= []).push(s); return acc;
  }, {});

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">📖 Lesson series</h2>
      <p className="mt-1 text-sm text-gray-500">Grouped by area of interest, so somebody can start where they actually are.</p>
      <Err msg={error} />

      {manage && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Series title"
            className="rounded-xl border border-gray-300 px-3 py-2" />
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Area of interest"
            className="rounded-xl border border-gray-300 px-3 py-2" />
          <Button disabled={!title.trim()} onClick={async () => {
            setError('');
            try { await live.addLessonSeries({ title, topic }); setTitle(''); setTopic(''); await load(); }
            catch (cause) { setError(message(cause)); }
          }}>Add</Button>
        </div>
      )}

      <div className="mt-4 space-y-4">
        {rows?.length === 0 && <p className="text-sm text-gray-400">No series yet.</p>}
        {Object.entries(byTopic).map(([t, list]) => (
          <div key={t}>
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">{t}</h3>
            <div className="mt-1 space-y-1">
              {list.map((s) => (
                <div key={s.id} className="rounded-xl bg-gray-50 p-3">
                  <p className="font-semibold text-navy">{s.title}</p>
                  {s.description && <p className="text-sm text-gray-600"><Linked text={s.description} /></p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

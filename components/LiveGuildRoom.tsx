'use client';

// Two things a Guide could not do, both on the Office screen.
//
// `LiveAskToWalkWith` is the Guide's side: who is waiting, and a way to say
// "I have room for them" without catching a Director in a corridor.
//
// `LivePairingRequestsForDirector` is the other side of the same table.
//
// `LiveGuildRoom` is the Guides' room. A ROOM, NOT PRIVATE MESSAGES, and that
// is a safeguarding decision rather than a shortcut: every private conversation
// in this app happens in exactly one place and is reportable, and Guide-to-Guide
// direct messages would be a second private channel with no oversight. A room
// read by every Guide and by leadership is accountable by construction.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useKeepUp, KEEP_UP_GUIDE_ROOM } from '@/lib/live/keep-up';
import * as live from '@/lib/live/data';
import { useLiveSession } from '@/lib/live/session';
import { Avatar, Button, Card } from '@/components/ui';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { NewBadge } from '@/components/NewBadge';
import { Linked } from '@/components/Linked';
import { MessageBox } from '@/components/MessageBox';
import { humanError } from '@/lib/live/errors';

const message = (cause: unknown) =>
  humanError(cause, 'That did not work.');

function Err({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
      {msg}
    </p>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------------------
// A Guide asks
// ---------------------------------------------------------------------------

export function LiveAskToWalkWith() {
  const { profile } = useLiveSession();
  const [waiting, setWaiting] = useState<live.UnpairedExplorer[] | null>(null);
  const [mine, setMine] = useState<live.PairingRequest[]>([]);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    try {
      const [rows, asks] = await Promise.all([
        live.unpairedExplorers(),
        live.listPairingRequests().catch(() => [] as live.PairingRequest[]),
      ]);
      setWaiting(rows);
      setMine(asks.filter((a) => a.guide_id === profile?.id));
      setError('');
    } catch (cause) {
      setWaiting([]);
      setError(message(cause));
    }
  }, [profile?.id]);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_GUIDE_ROOM, load);

  const askedFor = new Set(mine.filter((a) => a.status === 'pending').map((a) => a.ds_id));

  const ask = async (dsId: string) => {
    setBusy(dsId); setError(''); setFlash('');
    try {
      await live.askToWalkWith(dsId, note[dsId] ?? '');
      setNote((n) => ({ ...n, [dsId]: '' }));
      setFlash('Sent to your Director.');
      await load();
    } catch (cause) { setError(message(cause)); } finally { setBusy(''); }
  };

  return (
    <Card id="ask-to-walk" className="p-5">
      <h2 className="text-xl font-bold text-navy">🙋 Ask to walk with somebody</h2>
      <p className="mt-1 text-sm text-gray-500">
        Explorers nobody is walking with yet. Your Director decides who is
        paired with whom, so this puts your name forward rather than making the
        pairing.
      </p>
      <Err msg={error} />
      {flash && (
        <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          {flash}
        </p>
      )}

      {waiting === null ? (
        <BeaconSpinner inline label="Looking" className="mt-4" />
      ) : waiting.length === 0 ? (
        // The good news, said as good news. An empty list here means every
        // Explorer in the church has somebody, which is the number the whole
        // design turns on.
        <p className="mt-4 rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-800">
          Everybody is paired. Nothing waiting.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {waiting.map((p) => {
            const asked = askedFor.has(p.id);
            return (
              <div key={p.id} className="rounded-xl bg-gray-50 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={p.full_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate font-bold text-navy">{p.full_name}</p>
                      <NewBadge person={p} />
                    </div>
                    <p className="text-sm text-gray-500">Waiting for a Guide</p>
                  </div>
                  {asked ? (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                      Asked, waiting on your Director
                    </span>
                  ) : (
                    <Button disabled={busy === p.id} onClick={() => void ask(p.id)}>
                      {busy === p.id ? 'Sending…' : 'I have room'}
                    </Button>
                  )}
                </div>
                {!asked && (
                  <input
                    value={note[p.id] ?? ''}
                    onChange={(e) => setNote((n) => ({ ...n, [p.id]: e.target.value }))}
                    placeholder="Anything your Director should know? (optional)"
                    aria-label={`Why you can walk with ${p.full_name}`}
                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* THE EXPLORER IS NEVER TOLD they were asked for, which is why this list
          is only ever shown to the Guide who asked. Being wanted and not chosen
          is not something anybody should have to read about themselves. */}
      {mine.some((a) => a.status !== 'pending') && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
            Answered
          </p>
          <ul className="mt-1 space-y-1">
            {mine.filter((a) => a.status !== 'pending').map((a) => (
              <li key={a.id} className="text-sm text-gray-600">
                {a.status === 'accepted' ? '✅ Accepted' : '↩️ Not this time'}
                {' · '}{when(a.created_at)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The Director answers
// ---------------------------------------------------------------------------

export function LivePairingRequestsForDirector({ alone = false }: { alone?: boolean }) {
  const [rows, setRows] = useState<live.PairingRequest[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [asks, members] = await Promise.all([
        live.listPairingRequests(),
        // listMembers() IS right here and wrong in the room below. This panel
        // is only ever drawn for a Director, who can read every profile in
        // their church, and it needs the EXPLORER's name as well as the
        // Guide's. The room's roster holds Guides and leadership only.
        live.listMembers().catch(() => []),
      ]);
      setRows(asks.filter((a) => a.status === 'pending'));
      setNames(Object.fromEntries(members.map((m) => [m.id, m.full_name || 'Member'])));
      setError('');
    } catch (cause) { setRows([]); setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_GUIDE_ROOM, load);

  const decide = async (id: string, status: 'accepted' | 'declined') => {
    setBusy(id); setError('');
    try { await live.decidePairingRequest(id, status); await load(); }
    catch (cause) { setError(message(cause)); } finally { setBusy(''); }
  };

  // Nothing at all when nobody has asked -- a permanent empty panel among other
  // panels is furniture. BUT WHEN THIS IS THE WHOLE ROOM, vanishing is worse
  // than furniture: the Office tab is labelled and clicked on purpose, and an
  // empty page reads as a broken feature. Reported exactly that way, by an
  // Executive Director looking for a request a Guide had just sent -- which was
  // not here at all, because a Guide putting a NAME forward is a recommendation
  // and lands in Admin. Two features, similar names, and a blank panel offering
  // no way to tell them apart.
  if (rows !== null && rows.length === 0 && !error && !alone) return null;
  const empty = rows !== null && rows.length === 0 && !error;

  return (
    <Card id="pairing-requests" className="p-5">
      <h2 className="text-xl font-bold text-navy">🙋 Guides asking to walk with somebody</h2>
      <p className="mt-1 text-sm text-gray-500">
        Answering yes records your decision. Make the pairing itself on the
        Pairings screen, where the limit of five is checked.
      </p>
      <Err msg={error} />
      {empty && (
        <p className="mt-3 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
          No Guide is waiting on an answer. A Guide putting a new name forward is
          a different thing and waits in <strong>Admin, under Approvals</strong>.
        </p>
      )}
      <div className="mt-3 space-y-2">
        {rows?.map((a) => (
          <div key={a.id} className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="font-bold text-navy">
              {names[a.guide_id] ?? 'A Guide'}
              <span className="font-normal text-gray-500"> would walk with </span>
              {names[a.ds_id] ?? 'an Explorer'}
            </p>
            {a.note && <p className="mt-0.5 text-sm text-gray-600"><Linked text={a.note} /></p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button disabled={busy === a.id} onClick={() => void decide(a.id, 'accepted')}>
                Yes
              </Button>
              <Button variant="ghost" disabled={busy === a.id} onClick={() => void decide(a.id, 'declined')}>
                Not this time
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The Guides' room
// ---------------------------------------------------------------------------

export function LiveGuildRoom() {
  const { profile } = useLiveSession();
  const [rows, setRows] = useState<live.GuideRoomMessage[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  // Editing and taking back, one message at a time. Two open editors is two
  // drafts to lose, and a confirm left open on a message you have scrolled away
  // from is a tap waiting to go wrong.
  const [editing, setEditing] = useState('');
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState('');
  const [busyRow, setBusyRow] = useState('');
  const [rowError, setRowError] = useState('');

  const saveEdit = async (id: string) => {
    const text = draft.trim();
    if (!text) { setRowError('A message has to say something.'); return; }
    setBusyRow(id); setRowError('');
    try {
      await live.editGuideRoomMessage(id, text);
      setEditing(''); setDraft('');
      await load();
    } catch (cause) {
      setRowError(humanError(cause, 'That message could not be changed.'));
    } finally { setBusyRow(''); }
  };

  const takeBack = async (id: string) => {
    setBusyRow(id); setRowError('');
    try {
      await live.deleteGuideRoomMessage(id);
      setConfirming('');
      await load();
    } catch (cause) {
      setRowError(humanError(cause, 'That message could not be deleted.'));
    } finally { setBusyRow(''); }
  };
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const thread = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const [msgs, members] = await Promise.all([
        live.listGuideRoom(),
        // The room's own roster. listMembers() returns two rows to a Guide,
        // so every message would have said "Someone".
        live.guideRoomPeople().catch(() => []),
      ]);
      setRows(msgs);
      setNames(Object.fromEntries(members.map((m) => [m.id, m.full_name])));
      setError('');
    } catch (cause) { setRows([]); setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_GUIDE_ROOM, load);

  // Newest last, so the room opens at the current conversation. Scroll only
  // this message box: scrollIntoView also walks the page and used to pull the
  // whole Office down to the Guides' Room whenever its messages finished loading.
  useEffect(() => {
    const box = thread.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [rows?.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true); setError('');
    try { await live.postToGuideRoom(body); setBody(''); await load(); }
    catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  };

  return (
    <Card id="guides-room" className="p-5">
      <h2 className="text-xl font-bold text-navy">☕ The Guides&rsquo; room</h2>
      <p className="mt-1 text-sm text-gray-500">
        For Guides and your Directors. Explorers cannot see this. It is not a
        private message: everybody in the room reads it, which is what makes it
        safe to have.
      </p>
      <Err msg={error} />

      {rows === null ? (
        <BeaconSpinner inline label="Loading" className="mt-4" />
      ) : (
        <div
          ref={thread}
          className="beacon-scroll mt-4 max-h-[26rem] space-y-2 overflow-y-auto overscroll-contain pr-1"
        >
          {rows.length === 0 && (
            <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
              Nobody has said anything yet. Carrying people is hard work and
              this is where you say so.
            </p>
          )}
          {rows.map((m) => {
            const mine = m.author_id === profile?.id;
            const canDrop = mine
              || profile?.role === 'admin' || profile?.role === 'executive';
            const who = (id?: string | null) =>
              id && id === profile?.id ? 'You' : (names[id ?? ''] ?? 'Someone');
            return (
              <div key={m.id} className="rounded-xl bg-gray-50 px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="text-sm font-bold text-navy">
                    {mine ? 'You' : (names[m.author_id ?? ''] ?? 'Someone')}
                  </p>
                  <p className="text-xs text-gray-400">{when(m.created_at)}</p>
                  {m.edited_at && !m.deleted_at && (
                    <p className="text-xs italic text-gray-400">edited</p>
                  )}
                  {/* NOTHING TO DO TO A MESSAGE THAT IS ALREADY GONE. */}
                  {canDrop && !m.deleted_at && (
                    <div className="ml-auto flex items-center gap-3">
                      {mine && editing !== m.id && (
                        <button
                          type="button"
                          onClick={() => { setEditing(m.id); setDraft(m.body); setRowError(''); }}
                          className="text-xs font-semibold text-gray-500 underline"
                        >
                          Edit
                        </button>
                      )}
                      {/* IT ASKS NOW. This was one tap that destroyed a message
                          for everybody, with no confirmation and no way back --
                          and in this room a Director can tap it on somebody
                          else's words. */}
                      {confirming !== m.id ? (
                        <button
                          type="button"
                          onClick={() => { setConfirming(m.id); setRowError(''); }}
                          className="text-xs font-semibold text-red-700 underline"
                        >
                          Delete
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={busyRow === m.id}
                            onClick={() => void takeBack(m.id)}
                            className="text-xs font-semibold text-red-700 underline"
                          >
                            {busyRow === m.id ? 'Deleting' : (mine ? 'Yes, delete it' : 'Yes, remove it')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming('')}
                            className="text-xs font-semibold text-gray-500 underline"
                          >
                            Keep it
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {m.deleted_at ? (
                  /* A NAMED LINE, NEVER A GAP. This room is not anonymous and
                     leadership can remove somebody else's words, so a thread
                     that silently changed shape between visits would leave the
                     author untold and everybody else unsure whether they had
                     misremembered. The words themselves are gone from here. */
                  <p className="mt-0.5 text-[15px] italic leading-relaxed text-gray-500">
                    {m.deleted_by && m.deleted_by === m.author_id
                      ? `${who(m.deleted_by)} deleted a message`
                      : `${who(m.deleted_by)} removed a message from ${who(m.author_id)}`}
                  </p>
                ) : editing === m.id ? (
                  <div className="mt-1 space-y-2">
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      rows={3}
                      maxLength={4000}
                      autoFocus
                      aria-label="Change your message"
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-[15px] leading-relaxed text-gray-700"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="gold"
                        onClick={() => void saveEdit(m.id)}
                        disabled={busyRow === m.id}
                      >
                        {busyRow === m.id ? 'Saving' : 'Save the change'}
                      </Button>
                      <Button variant="ghost" onClick={() => { setEditing(''); setDraft(''); }}>
                        Leave it as it was
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-0.5 whitespace-pre-wrap text-[15px] leading-relaxed text-gray-700">
                    <Linked text={m.body} />
                  </p>
                )}

                {rowError && (editing === m.id || confirming === m.id) && (
                  <p className="mt-1 text-xs text-red-800">{rowError}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <form onSubmit={send} className="mt-3 flex items-end gap-2">
        <MessageBox value={body} onChange={setBody} />
        <Button type="submit" variant="gold" disabled={busy || !body.trim()} className="shrink-0">
          {busy ? 'Sending…' : 'Send'}
        </Button>
      </form>
    </Card>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useKeepUp, KEEP_UP_LIBRARY_RECORD } from '@/lib/live/keep-up';
import * as live from '@/lib/live/data';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { Button, Card } from '@/components/ui';
import { humanError } from '@/lib/live/errors';

// What the church's people have been sharing, and the switch beside it.
//
// THE DECISION THIS SCREEN CARRIES. A Guide and an Explorer share links with
// each other freely, without asking anybody. That freedom is the point; it is
// also the thing that needs an answer to "and what if somebody misuses it".
// The answer is not a permission gate in front of every share. It is a record
// afterwards, read by the rank above, with a way to stop somebody who is
// misusing it.
//
// WHAT IS NOT ON THIS SCREEN, AND WHY IT IS THE POINT OF IT. Asked for in these
// words: "Head ED, ED, and Directors can detect the activities (Except for chat)
// of Guide and Explorer, but the Head ED, ED, and Directors can't see the
// references ... the website can't be seen but the Director can see the label of
// the activity is not good."
//
// Until today this screen printed the address of everything anybody shared. It
// does not now, and not because the line was deleted: the column was dropped
// from the database, so there is no address for a later version of this file to
// print by accident. What is here instead is what KIND of thing it was -- Adult
// content, Gambling, A shortened link, A file that installs something -- decided
// by the database as the row is written, and how many times that same site has
// come up for that same person.
//
// WHO SEES WHOM is decided in the database and not here. A Director reads this
// for the Guides and Explorers of a church they lead. An Executive Director,
// head or otherwise, reads those AND the Directors. Nobody appears in their own
// oversight.
//
// THIRTY DAYS. Rows older than that are deleted, and the pruning happens
// whenever this is opened or anything new is shared, so there is no scheduled
// job to forget about and discover was never running.

const ROLE_WORD: Record<string, string> = {
  dm: 'Guide',
  ds: 'Explorer',
  admin: 'Director',
  executive: 'Executive Director',
};

function when(iso: string) {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

// THREE WORDS, AND THE MIDDLE ONE MATTERS MOST. "Needs a look" is not an
// accusation and is not nothing: most of what a Director should act on lands
// there, and a record with only "fine" and "bad" pushes everything into one or
// the other.
const CONCERN: Record<live.LibraryActivity['concern'], { word: string; className: string }> = {
  ordinary: { word: 'Ordinary', className: 'bg-gray-100 text-gray-700' },
  questionable: { word: 'Needs a look', className: 'bg-amber-100 text-amber-900' },
  harmful: { word: 'Not good', className: 'bg-red-100 text-red-900' },
};

const DID: Record<live.LibraryActivity['action'], string> = {
  added: 'Added',
  shared: 'Shared',
  pocketed: 'Put in their pocket',
};

export function LiveLibraryRecord({ audience }: { audience: 'admin' | 'executive' }) {
  const [rows, setRows] = useState<live.LibraryActivity[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [asking, setAsking] = useState('');
  const [reason, setReason] = useState('');
  const [casing, setCasing] = useState('');
  const [caseNote, setCaseNote] = useState('');
  const [opened, setOpened] = useState('');

  const load = useCallback(async () => {
    try { setRows(await live.listLibraryActivity()); setError(''); }
    catch (cause) { setRows([]); setError(humanError(cause, 'Could not load the library record.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_LIBRARY_RECORD, load);

  const setBlock = async (personId: string, blocked: boolean, why?: string) => {
    setBusy(personId);
    setError('');
    try {
      await live.setLibraryBlock(personId, blocked, why);
      setAsking('');
      setReason('');
      await load();
    } catch (cause) {
      setError(humanError(cause, 'That could not be changed.'));
    } finally {
      setBusy('');
    }
  };

  const openCase = async (activityId: string) => {
    setBusy(activityId);
    setError('');
    try {
      await live.openCaseFromActivity(activityId, caseNote);
      setCasing('');
      setCaseNote('');
      setOpened(activityId);
    } catch (cause) {
      setError(humanError(cause, 'That case could not be opened.'));
    } finally {
      setBusy('');
    }
  };

  // AN EXECUTIVE DIRECTOR READS EVERYBODY BELOW THEM NOW, where before they read
  // Directors only and were shown nothing about a Guide or an Explorer.
  const watching = audience === 'executive'
    ? 'Directors, Guides and Explorers'
    : 'Guides and Explorers';

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">📚 Activity record</h2>
      <p className="mt-1 text-sm text-gray-500">
        What the {watching} of your church added, shared and put in their pocket, newest
        first. Nothing from a conversation appears here.
      </p>
      <p className="mt-2 rounded-xl bg-sky-50 p-3 text-sm text-slate-700 ring-1 ring-sky-100">
        <strong>You can see what was done, not what it was done with.</strong> Addresses
        are not shown to leadership and are not kept in this record at all. Each one is
        labelled by what kind of thing it is, and anything labelled{' '}
        <span className="font-semibold">Not good</span> sends you an alert when it
        happens.
      </p>
      <p className="mt-2 rounded-xl bg-sky-50 p-3 text-sm text-slate-700 ring-1 ring-sky-100">
        <strong>Kept for 30 days, then deleted.</strong> This is a record for answering
        what happened recently, not an archive. If something here needs to last longer than
        a month, open a case about it, because those are never deleted.
      </p>

      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>}

      {rows === null ? (
        <BeaconSpinner inline label="Reading the record" className="mt-4" />
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
          Nothing shared in the last 30 days.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl bg-gray-50 p-4">
              <p className="text-sm font-bold text-navy">
                {r.actor_name}{' '}
                <span className="font-normal text-gray-500">· {ROLE_WORD[r.actor_role] ?? r.actor_role}</span>
                {r.blocked && (
                  <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                    Blocked
                  </span>
                )}
              </p>
              <p className="mt-1 break-words text-sm text-gray-700">
                {DID[r.action] ?? 'Added'} <strong>{r.title}</strong>
                {r.with_name && <> with {r.with_name}</>}
                {r.source === 'pocket' && (
                  <span className="text-gray-500"> · in their pocket of web apps</span>
                )}
              </p>

              {/* THE LABEL SITS WHERE THE ADDRESS USED TO. It names a kind of
                  thing and never a site, so a Director can tell a problem from
                  an ordinary Tuesday without being handed the link. */}
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${CONCERN[r.concern].className}`}>
                  {CONCERN[r.concern].word}
                </span>
                <span className="text-gray-700">{r.label}</span>
              </p>

              {/* FOURTH TIME, NOT WHICH SITE. The count is what turns a slip
                  into something worth asking about, and it says nothing about
                  where they went. */}
              {r.seen_before > 1 && (
                <p className="mt-1 text-xs text-gray-500">
                  The {r.seen_before}
                  {r.seen_before === 2 ? 'nd' : r.seen_before === 3 ? 'rd' : 'th'} time
                  {' '}this person has been to the same place.
                </p>
              )}

              <p className="mt-1 text-xs text-gray-500">{when(r.occurred_at)}</p>

              {/* A CASE, FROM THE ROW ITSELF. "Once those inappropriate things
                  happen, Head ED, ED, and Directors can file an open case." It
                  goes through the same report path as everything else, so what
                  is opened here is the same object a member could have raised,
                  answered by the same people and kept for as long. */}
              {r.actor_id && (opened === r.id ? (
                <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
                  <strong>Case opened.</strong> It is in Settings under Admin Reports, with
                  the label on it. Claim it there so two people are not working on it at once.
                </p>
              ) : casing === r.id ? (
                <div className="mt-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
                  <p className="text-sm font-semibold text-amber-900">
                    Open a case about {r.actor_name}?
                  </p>
                  <p className="mt-1 text-sm text-amber-900/80">
                    The case will say what they did and how it was labelled. It cannot say
                    which address it was, because you have not been shown it.
                  </p>
                  <input
                    value={caseNote}
                    onChange={(e) => setCaseNote(e.target.value)}
                    placeholder="Anything you want on the record (optional)"
                    aria-label="Anything you want on the record"
                    className="tap mt-2 w-full rounded-xl bg-white px-3 text-base outline-none ring-1 ring-amber-200 focus:ring-2 focus:ring-gold"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button disabled={busy === r.id} onClick={() => void openCase(r.id)}>
                      Open the case
                    </Button>
                    <Button variant="ghost" onClick={() => { setCasing(''); setCaseNote(''); }}>
                      Not now
                    </Button>
                  </div>
                </div>
              ) : null)}

              {r.actor_id && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {opened !== r.id && casing !== r.id && (
                    <Button variant="ghost" onClick={() => { setCasing(r.id); setCaseNote(''); }}>
                      Open a case
                    </Button>
                  )}
                  {r.blocked ? (
                    <Button variant="ghost" disabled={busy === r.actor_id}
                            onClick={() => void setBlock(r.actor_id!, false)}>
                      Let them share again
                    </Button>
                  ) : asking === r.actor_id ? (
                    <div className="w-full rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
                      <p className="text-sm font-semibold text-red-900">
                        Stop {r.actor_name} sharing anything in the library?
                      </p>
                      <p className="mt-1 text-sm text-red-900/80">
                        They keep their account and their conversation. They can be let
                        back in at any time.
                      </p>
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Why, in a few words"
                        aria-label="Why they are being blocked"
                        className="tap mt-2 w-full rounded-xl bg-white px-3 text-base outline-none ring-1 ring-red-200 focus:ring-2 focus:ring-gold"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button variant="danger" disabled={busy === r.actor_id}
                                onClick={() => void setBlock(r.actor_id!, true, reason)}>
                          Block
                        </Button>
                        <Button variant="ghost" onClick={() => { setAsking(''); setReason(''); }}>
                          Keep it as it is
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="danger" disabled={busy === r.actor_id}
                            onClick={() => setAsking(r.actor_id!)}>
                      Block from sharing
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

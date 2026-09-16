'use client';

// The Hall of Justice: what is being heard, and who is in the room.
//
// ASKED FOR: "Any Director, ED, and Head can join the trial room (the court
// room should look like a UI game where it is looks like a virtual Hall of
// Justice Room)", and then, corrected twice: "yes do that, except trials
// about themselves or fellow Directors", and then "what I mean ED, Director
// and Head Director can join is they are on the sidelines and can monitor the
// hearing. That's all. The only one who accepted the case will be main Judge
// Director."
//
// WHAT THIS FILE IS NOT ALLOWED TO DECIDE. Every rule lives in migration
// 20260916120000. `trials_i_may_sit_on` already excludes a case about the
// person asking and, unless they are an Executive Director, a case about a
// Director. So a list that is empty is a list of cases they may not watch, and
// this screen cannot widen that by drawing a button.
//
// WATCHING IS SILENT, and that is enforced by trial_statements_speak rather
// than by this file drawing no composer: the person who accepted the case and
// the people actually called to it may speak, and an observer may not. The
// first version of this screen let every watcher post into the hearing, which
// would have put Directors in a member's transcript who were never called.
//
// WHY IT LOOKS LIKE A ROOM RATHER THAN A TABLE. A hearing about a member of a
// church is the heaviest thing this app does, and it used to be a list of grey
// cards indistinguishable from a roster. The room is deep navy with a gold
// bench line and the watchers drawn as a row -- serious rather than playful, and
// nothing decorative moves, because a page about somebody's conduct is not the
// place for an animation. What the visual is FOR is telling somebody at a
// glance that they have walked somewhere different.

import { useCallback, useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui';
import * as live from '@/lib/live/data';
import { humanError } from '@/lib/live/errors';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { useKeepUp, KEEP_UP_CASES } from '@/lib/live/keep-up';
import { roleNoun } from '@/lib/brand';
import type { Profile } from '@/lib/types';

function Watchers({ n, mine }: { n: number; mine: boolean }) {
  // Eight places drawn, however many are filled: an empty one is the point. A
  // hearing with one watcher should look like a hearing with one watcher, not
  // like a full room.
  const chairs = Array.from({ length: 8 }, (_, i) => i < n);
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {chairs.map((taken, i) => (
        <span
          key={i}
          className="h-2.5 w-2.5 rounded-full"
          style={{
            backgroundColor: taken ? '#E8B84B' : 'rgba(255,255,255,.18)',
            boxShadow: taken && mine && i === n - 1 ? '0 0 0 2px rgba(232,184,75,.35)' : undefined,
          }}
        />
      ))}
    </div>
  );
}

function Hearing({ t, onJoin, busy }: {
  t: live.SeatableTrial;
  onJoin: (id: string) => void;
  busy: string | null;
}) {
  const open = t.status === 'open';
  return (
    <div
      className="overflow-hidden rounded-2xl ring-1 ring-black/20"
      style={{ backgroundColor: '#16223F' }}
    >
      {/* The bench line. Gold on navy is the app's own pairing, used here at
          full strength because this is the one room that should feel formal.
          It marks where the hearing is run from, which is one person. */}
      <div className="h-1 w-full" style={{ backgroundColor: '#E8B84B' }} />

      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">
              {open ? 'Now being heard' : 'Closed'}
            </p>
            <h3 className="mt-0.5 truncate text-lg font-extrabold text-white">
              {t.accused_name ?? 'A member'}
            </h3>
            <p className="text-sm text-white/60">{roleNoun(t.accused_role as Profile['role'])}</p>
          </div>

          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">
              Watching
            </p>
            <div className="mt-1.5 flex justify-end">
              <Watchers n={Number(t.watching)} mine={t.i_am_watching} />
            </div>
          </div>
        </div>

        <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-black/20 p-3 text-sm text-white/85">
          {t.summary}
        </p>

        {t.verdict && (
          <p className="mt-2 text-sm font-bold text-white">
            Verdict: <span className="text-gold">{t.verdict}</span>
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* THE JUDGE IS NAMED, BECAUSE THE TWO ROLES LOOK IDENTICAL FROM
              HERE OTHERWISE. Watching and hearing a case are the same row in
              trial_parties as far as the eye goes, and only one of them can
              speak or decide. Saying which one somebody is, is the difference
              between a hearing and a crowd. */}
          {t.i_am_judge ? (
            <span className="rounded-full bg-gold px-3 py-1 text-xs font-bold text-navy">
              You are hearing this case
            </span>
          ) : t.i_am_watching ? (
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/80">
              You are watching
            </span>
          ) : open ? (
            <Button variant="gold" disabled={busy === t.id} onClick={() => onJoin(t.id)}>
              {busy === t.id ? 'Joining' : 'Watch this hearing'}
            </Button>
          ) : null}
          <a
            href="/cases"
            className="text-xs font-semibold text-white/70 underline underline-offset-2"
          >
            Open the case
          </a>
        </div>
      </div>
    </div>
  );
}

export function LiveHallOfJustice({ me }: { me: Profile }) {
  const [rows, setRows] = useState<live.SeatableTrial[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await live.trialsIMaySitOn());
    } catch (cause) {
      setError(humanError(cause, 'The hall could not be opened.'));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // Somebody else beginning to watch, or a verdict landing, shows up without a
  // reload -- which is most of the reason to draw a room at all.
  useKeepUp(KEEP_UP_CASES, load);

  const join = async (id: string) => {
    setBusy(id);
    setError('');
    try {
      await live.joinTrial(id);
      await load();
    } catch (cause) {
      setError(humanError(cause, 'That hearing could not be joined.'));
    } finally {
      setBusy(null);
    }
  };

  if (me.role !== 'admin' && me.role !== 'executive') return null;
  if (rows === null) return <BeaconSpinner inline label="Opening the hall" />;

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">🏛️ Hall of Justice</h2>
      <p className="mt-1 text-sm text-gray-500">
        Hearings you may watch. Watching is recorded, so the case always says
        who was in the room, and it carries no voice: only the Director who
        accepted a case speaks in it or decides it.
      </p>

      {/* SAID OUT LOUD, BECAUSE AN EMPTY LIST IS AMBIGUOUS OTHERWISE. Somebody
          who cannot see a case they know exists should be told why rather than
          left to wonder whether the app is broken. */}
      <p className="mt-2 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
        A case about you, or about another Director, is not here. Those are
        heard by Executive Directors.
      </p>

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl bg-gray-50 p-6 text-center text-gray-500">
          Nothing is being heard.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((t) => <Hearing key={t.id} t={t} onJoin={join} busy={busy} />)}
        </div>
      )}
    </Card>
  );
}

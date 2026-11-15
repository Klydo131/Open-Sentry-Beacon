'use client';

// The appointment record, the same for a Guide and an Explorer
// (lib/meeting-record.ts says what happened to each one).
//
// FOLDED SHUT UNDER ITS COUNTS, because a diary is about what is next: the
// summary line ("Met 4 times · 2 called off · 1 declined") is the answer most
// people want, and the list opens when somebody asks.
//
// "DID YOU MEET?" ON AN AGREED TIME THAT HAS PASSED. Either person can say it
// took place or did not, and it is recorded with their name. Until somebody
// says, it counts as met, as the app always has.

import { useMemo, useState } from 'react';

import { meetingRecord, RECORD_FILTERS, type Outcome, type RecordInput } from '@/lib/meeting-record';

const TONE: Record<Outcome, string> = {
  ahead: 'bg-sky-50 text-sky-800 ring-sky-200',
  agreed: 'bg-amber-50 text-amber-900 ring-amber-200',
  held: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  missed: 'bg-slate-100 text-slate-700 ring-slate-200',
  moved: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
  'called-off': 'bg-rose-50 text-rose-800 ring-rose-200',
  declined: 'bg-orange-50 text-orange-800 ring-orange-200',
  unanswered: 'bg-slate-100 text-slate-700 ring-slate-200',
};

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function MeetingRecord({ meetings, onMark, busy = false }: {
  meetings: RecordInput[];
  /** Say how an agreed time went. Leave out where it cannot be recorded. */
  onMark?: (id: string, how: 'done' | 'missed') => void;
  busy?: boolean;
}) {
  const record = useMemo(() => meetingRecord(meetings, Date.now()), [meetings]);
  const [filter, setFilter] = useState<(typeof RECORD_FILTERS)[number]['key']>('all');
  if (record.rows.length === 0) return null;

  const c = record.counts;
  const summary = [
    record.met === 1 ? 'Met once' : `Met ${record.met} times`,
    c['called-off'] && `${c['called-off']} called off`,
    c.moved && `${c.moved} moved`,
    c.declined && `${c.declined} declined`,
    c.missed && `${c.missed} did not happen`,
    c.unanswered && `${c.unanswered} never answered`,
  ].filter(Boolean).join(' · ');
  const chosen = RECORD_FILTERS.find((f) => f.key === filter) ?? RECORD_FILTERS[0];
  const shown = record.rows.filter((r) => chosen.takes.includes(r.outcome));

  return (
    <details className="mt-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5" data-meeting-record>
      <summary className="cursor-pointer">
        <span className="text-sm font-bold text-navy">Appointment record</span>
        <span className="mt-0.5 block text-sm text-gray-600" data-meeting-record-summary>{summary}</span>
      </summary>
      <p className="mt-3 text-sm text-gray-600">
        Every appointment you and your partner have made, and how it ended. You both see the same record.
        Nothing is erased: a deleted appointment is kept here as called off, with who did it and when.
      </p>
      <div role="group" aria-label="Show" className="mt-3 flex flex-wrap gap-2">
        {RECORD_FILTERS.map((f) => {
          const n = record.rows.filter((r) => f.takes.includes(r.outcome)).length;
          if (f.key !== 'all' && n === 0) return null;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              data-meeting-record-filter={f.key}
              className={`tap-sm rounded-full px-3 text-sm font-semibold ring-1 ${filter === f.key ? 'bg-navy text-white ring-navy' : 'bg-white text-navy ring-navy/10'}`}
            >
              {f.label} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>
      <ul className="mt-3 grid gap-2">
        {shown.map((r) => (
          <li key={r.id} className="rounded-xl bg-white p-3 ring-1 ring-navy/5" data-meeting-record-row={r.outcome}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 flex-1 break-words text-sm font-semibold text-navy">{r.title || 'A time together'}</p>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${TONE[r.outcome]}`}>{r.label}</span>
            </div>
            <p className="mt-0.5 text-sm text-gray-500">
              {when(r.startsAt)} · {r.mode === 'online' ? 'Online call' : 'In person'}
            </p>
            <p className="mt-0.5 break-words text-sm text-gray-700">{r.detail}</p>
            {r.notes && (
              <p className="mt-1 whitespace-pre-wrap break-words border-t border-navy/5 pt-1 text-sm text-gray-600">{r.notes}</p>
            )}
            {r.outcome === 'agreed' && onMark && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onMark(r.id, 'done')}
                  data-meeting-mark="done"
                  className="tap-sm rounded-full bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-40"
                >
                  We met
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onMark(r.id, 'missed')}
                  data-meeting-mark="missed"
                  className="tap-sm rounded-full bg-white px-4 text-sm font-semibold text-navy ring-1 ring-navy/15 disabled:opacity-40"
                >
                  It did not happen
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

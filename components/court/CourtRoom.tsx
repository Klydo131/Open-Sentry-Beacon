'use client';

// The court room: the door, the docket, and the hearing that is open.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 20 October 2026: a court room for Directors and Executive
// Directors that is functional and simple, with simple advanced settings, one
// of the highest securities in the app at its door, digital forensic and
// exhibit tools, and that looks like a court room when you are in it.
//
// THE ORDER THINGS HAPPEN IN:
//   1. Ask the database for the door (lib/live/court.ts). A database without
//      the court room's update answers "no such function", and the page keeps
//      the room it had before: the Hall of Justice and the cases, working.
//   2. A shut door draws the door, and nothing behind it is fetched.
//   3. An open door draws the docket (every case this person may see) and the
//      hearing that is selected. ?case=<id> opens one; ?open=<member id> opens
//      the form to start a case about that person, from the trial room.
//   4. When the pass runs out, whatever is open answers "locked" and the door
//      is drawn again. Nothing is kept on the device: closing the tab is
//      leaving the room.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { ChevronGlyph, ChevronLeftGlyph, SearchGlyph } from '@/components/Glyph';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { LiveCourt } from '@/components/LiveTrialRoom';
import { LiveHallOfJustice } from '@/components/LiveHallOfJustice';
import { CourtDoorPanel } from '@/components/court/CourtDoorPanel';
import { Hearing } from '@/components/court/Hearing';
import { Seal } from '@/components/court/CourtFurniture';
import {
  courtCases, courtDoor, courtEdition, courtOpen, courtTakeSeat, courtWatch, isCourtLocked,
  type CourtCaseRow, type CourtDoor,
} from '@/lib/live/court';
import { minutesLeft } from '@/lib/live/court-door';
import { humanError } from '@/lib/live/errors';
import { useKeepUp, KEEP_UP_CASES } from '@/lib/live/keep-up';
import * as live from '@/lib/live/data';
import { roleNoun } from '@/lib/brand';
import type { Profile } from '@/lib/types';
import '@/components/court/court.css';

const ADVANCED_KEY = 'beacon.court-advanced';

function readParam(name: string): string {
  if (typeof window === 'undefined') return '';
  const v = new URLSearchParams(window.location.search).get(name) ?? '';
  return /^[0-9a-f-]{36}$/i.test(v) ? v : '';
}

function writeCaseParam(id: string) {
  try {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('case', id); else url.searchParams.delete('case');
    url.searchParams.delete('open');
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // Only the address bar; the room works without it.
  }
}

export function LiveCourtRoom({ me, emptyState }: { me: Profile; emptyState: React.ReactNode }) {
  const [edition, setEdition] = useState<'court' | 'cases' | null>(null);
  const [door, setDoor] = useState<CourtDoor | null>(null);
  const [cases, setCases] = useState<CourtCaseRow[] | null>(null);
  const [selected, setSelected] = useState('');
  const [openFor, setOpenFor] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [tick, setTick] = useState(0);
  const [shelf, setShelf] = useState<'now' | 'earlier'>('now');
  const [find, setFind] = useState('');
  const roomRef = useRef<HTMLDivElement | null>(null);
  // Read inside loadCases, so a live change cannot ask a database without the
  // court room for its cases before anybody knows which database this is.
  const editionRef = useRef<'court' | 'cases' | null>(null);

  useEffect(() => {
    try { setAdvanced(window.localStorage.getItem(ADVANCED_KEY) === 'on'); } catch { /* per device only */ }
    setSelected(readParam('case'));
    setOpenFor(readParam('open'));
  }, []);

  const lock = useCallback(() => {
    setCases(null);
    setDoor((d) => (d ? { ...d, open: false, needs: d.two_step ? 'code' : d.leader ? 'two_step' : 'password' } : d));
    void courtDoor().then(setDoor).catch(() => undefined);
  }, []);

  const loadCases = useCallback(async () => {
    if (editionRef.current !== 'court') return;
    try {
      setCases(await courtCases());
      setError('');
    } catch (cause) {
      if (isCourtLocked(cause)) { lock(); return; }
      setError(humanError(cause, 'The court room could not be opened.'));
    }
  }, [lock]);

  const start = useCallback(async () => {
    const found = await courtEdition();
    if (!found) { setError('The court room could not be reached. Check your connection and try again.'); return; }
    editionRef.current = found.edition;
    setEdition(found.edition);
    setDoor(found.door);
    if (found.edition === 'court' && found.door?.open) await loadCases();
  }, [loadCases]);

  useEffect(() => { void start(); }, [start]);

  // Somebody else speaking, entering an exhibit or deciding wakes this screen.
  // A shut door hears nothing: every row behind it asks for the pass.
  useKeepUp(KEEP_UP_CASES, loadCases);

  // The pass runs out on its own: look again every half minute.
  useEffect(() => {
    if (!door?.open) return;
    const timer = window.setInterval(() => {
      if (minutesLeft(door.until) <= 0) lock();
      else setTick((t) => t + 1);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [door, lock]);

  const toggleAdvanced = (on: boolean) => {
    setAdvanced(on);
    try { window.localStorage.setItem(ADVANCED_KEY, on ? 'on' : 'off'); } catch { /* per device only */ }
  };

  // One thing at a time: choosing a case puts it where the list was, and the
  // top of the room back in view; "All cases" brings the list back.
  const choose = (id: string) => {
    setSelected(id);
    writeCaseParam(id);
    window.requestAnimationFrame(() => {
      const top = roomRef.current?.getBoundingClientRect().top ?? 0;
      if (top < 0) roomRef.current?.scrollIntoView({ block: 'start' });
    });
  };

  // ----------------------------------------------------------------- drawing --

  if (error && !edition) return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>;
  if (!edition) return <BeaconSpinner inline label="Opening the court room" />;

  if (edition === 'cases') {
    // The database has not had the court room's update. The room it had
    // before still works, and a leader is told what is waiting.
    const leads = me.role === 'admin' || me.role === 'executive';
    return (
      <div className="space-y-5">
        {leads && (
          <p className="rounded-xl bg-gray-50 px-4 py-2.5 text-sm text-gray-700 ring-1 ring-gray-200">
            A new court room, with a door that asks for your code, exhibits and a sealed record, is ready and
            waiting for your church&rsquo;s database to be updated. Until then, this is the room you had.
          </p>
        )}
        <LiveHallOfJustice me={me} />
        <LiveCourt me={me} emptyState={emptyState} />
      </div>
    );
  }

  if (!door) return <BeaconSpinner inline label="Opening the court room" />;
  if (!door.open) return <CourtDoorPanel door={door} onOpened={async () => { await start(); }} />;

  const mine = (cases ?? []).filter((c) => c.my_place);
  const watchable = (cases ?? []).filter((c) => !c.my_place);
  const leads = me.role === 'admin' || me.role === 'executive';
  void tick;

  const watch = async (id: string) => {
    setBusy(id);
    setError('');
    try {
      await courtWatch(id);
      await loadCases();
      choose(id);
    } catch (cause) {
      if (isCourtLocked(cause)) { lock(); return; }
      setError(humanError(cause, 'That hearing could not be joined.'));
    } finally {
      setBusy('');
    }
  };

  const takeSeat = async (id: string) => {
    setBusy(id);
    setError('');
    try {
      const answer = await courtTakeSeat(id);
      if (answer !== 'ok') { setError(answer); return; }
      await loadCases();
      choose(id);
    } catch (cause) {
      if (isCourtLocked(cause)) { lock(); return; }
      setError(humanError(cause, 'The seat could not be taken.'));
    } finally {
      setBusy('');
    }
  };

  const selectedCase = selected ? (cases ?? []).find((c) => c.id === selected && c.my_place) : undefined;

  // THE TWO SHELVES. Now: the cases still going, yours and the hearings you
  // may watch. Earlier: everything that has ended. A closed case used to sit
  // among "hearings you may watch", where nobody could watch it.
  // A case ruled this week stays on Now: somebody told "the Church Board has
  // ruled" opens this page to read it, and must not have to know to look
  // under Earlier.
  const lately = (c: CourtCaseRow) => c.status === 'closed' && Boolean(c.closed_at)
    && Date.now() - new Date(c.closed_at ?? 0).getTime() < RULED_LATELY_MS;
  const nowMine = mine.filter((c) => c.status !== 'closed');
  const ruledLately = mine.filter(lately);
  const nowWatch = leads ? watchable.filter((c) => c.status === 'open') : [];
  const earlierMine = mine.filter((c) => c.status === 'closed' && !lately(c));
  const earlierOther = leads ? watchable.filter((c) => c.status !== 'open') : [];
  const nowCount = nowMine.length + ruledLately.length + nowWatch.length;
  const earlierCount = earlierMine.length + earlierOther.length;
  const shelfSize = shelf === 'now' ? nowCount : earlierCount;
  const needle = find.trim().toLowerCase();
  const found = (c: CourtCaseRow) => !needle
    || `${c.subject_name}\n${c.summary}\n${c.judge_name}\n${c.opener_name}`.toLowerCase().includes(needle);

  return (
    <div ref={roomRef} className="ct-room space-y-3" data-court-room>
      <header className="ct-top">
        <Seal className="ct-seal" />
        <div className="ct-top-words">
          <h2 className="ct-top-title">The court room</h2>
          <p className="ct-top-door" data-court-door-time>
            <span className="ct-door-dot" aria-hidden />
            Door open for {minutesLeft(door.until)} more minutes. Everything here is on the record.
          </p>
        </div>
        <label className="ct-switch">
          <input type="checkbox" role="switch" checked={advanced} onChange={(e) => toggleAdvanced(e.target.checked)} data-court-advanced-toggle />
          <span>Advanced settings</span>
        </label>
      </header>

      {error && <p className="ct-finding ct-finding-bad" role="alert">{error}</p>}

      {selectedCase ? (
        <>
          <div className="ct-casebar">
            <button type="button" className="ct-back" onClick={() => choose('')} data-court-back>
              <ChevronLeftGlyph size={20} /> All cases
            </button>
          </div>
          <Hearing
            id={selectedCase.id}
            me={me}
            advanced={advanced}
            onAdvanced={toggleAdvanced}
            onLocked={lock}
            onChanged={loadCases}
          />
        </>
      ) : (
        <div className="ct-list" data-court-list>
          <div className="ct-listbar">
            <div className="ct-shelves" role="tablist" aria-label="Which cases">
              {(['now', 'earlier'] as const).map((k) => (
                <button key={k} type="button" role="tab" className="ct-shelf" aria-selected={shelf === k}
                        onClick={() => setShelf(k)} data-court-shelf={k}>
                  {k === 'now' ? 'Now' : 'Earlier'}
                  <span className="ct-count">{k === 'now' ? nowCount : earlierCount}</span>
                </button>
              ))}
            </div>
            {leads && (
              <Button variant={openFor ? 'ghost' : 'gold'} onClick={() => setOpenFor(openFor ? '' : 'choose')}>
                {openFor ? 'Cancel' : 'Open a case'}
              </Button>
            )}
          </div>

          {openFor && leads && (
            <OpenCase
              me={me}
              preselected={openFor === 'choose' ? '' : openFor}
              onOpened={async (id) => { setOpenFor(''); setShelf('now'); await loadCases(); choose(id); }}
              onLocked={lock}
            />
          )}

          {shelfSize > 5 && (
            <label className="ct-search">
              <SearchGlyph size={18} />
              <span className="sr-only">Find a case</span>
              <input type="search" value={find} onChange={(e) => setFind(e.target.value)}
                     placeholder="Find a case: a name, or what it is about" data-court-find />
            </label>
          )}

          {!cases ? (
            <BeaconSpinner inline label="Reading the docket" />
          ) : shelf === 'now' ? (
            <>
              {(nowMine.length > 0 || (!leads && ruledLately.length === 0)) && (
                <CaseGroup title="Your cases">
                  {nowMine.length === 0 ? (
                    mine.length === 0 ? <>{emptyState}</> : (
                      <p className="ct-empty">Nothing open now. Your earlier cases are under Earlier.</p>
                    )
                  ) : (
                    <ul className="ct-cases">
                      {nowMine.filter(found).map((c) => <CaseRow key={c.id} c={c} onOpen={() => choose(c.id)} />)}
                    </ul>
                  )}
                </CaseGroup>
              )}
              {ruledLately.length > 0 && (
                <CaseGroup title="Ruled this week">
                  <ul className="ct-cases">
                    {ruledLately.filter(found).map((c) => <CaseRow key={c.id} c={c} onOpen={() => choose(c.id)} />)}
                  </ul>
                </CaseGroup>
              )}
              {leads && !openFor && nowCount === 0 && (
                <p className="ct-empty">No case is open. Open one, or look under Earlier.</p>
              )}
              {nowWatch.length > 0 && (
                <CaseGroup title="Hearings you may watch">
                  <p className="ct-hint mb-2">
                    Watching is a recorded seat in the gallery, with no voice. A case about you, or about another
                    Director, is not here: those are heard by Executive Directors.
                  </p>
                  <ul className="ct-cases">
                    {nowWatch.filter(found).map((c) => (
                      <li key={c.id} className="ct-case" data-status={c.status} data-court-watch={c.id}>
                        <div className="ct-case-still">
                          <span className="ct-case-body">
                            <span className="ct-case-top">
                              <span className="ct-case-name">{c.subject_name}</span>
                              <span className="ct-status" data-status={c.status}>{standing(c)}</span>
                            </span>
                            <span className="ct-case-meta">
                              {c.subject_role ? `${roleNoun(c.subject_role as Profile['role'])} · ` : ''}
                              Judge: {c.judge_name}{c.watching ? ` · ${c.watching} watching` : ''}
                            </span>
                          </span>
                          <span className="ct-case-actions">
                            {me.role === 'executive' && c.escalation === 'requested' && (
                              <Button variant="gold" disabled={busy === c.id} onClick={() => void takeSeat(c.id)}>
                                Take the seat as judge
                              </Button>
                            )}
                            {c.may_watch ? (
                              <Button variant="ghost" disabled={busy === c.id} onClick={() => void watch(c.id)}>
                                {busy === c.id ? 'Taking a seat' : 'Watch from the gallery'}
                              </Button>
                            ) : (
                              <span className="text-sm text-[#4a4f63]">Heard in private</span>
                            )}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CaseGroup>
              )}
            </>
          ) : (
            <>
              {earlierMine.length + earlierOther.length === 0 && <p className="ct-empty">Nothing has ended yet.</p>}
              {earlierMine.length > 0 && (
                <CaseGroup title="Your earlier cases">
                  <ul className="ct-cases ct-cases-earlier">
                    {earlierMine.filter(found).map((c) => <CaseRow key={c.id} c={c} onOpen={() => choose(c.id)} />)}
                  </ul>
                </CaseGroup>
              )}
              {earlierOther.length > 0 && (
                <CaseGroup title="Other cases in the church">
                  <ul className="ct-cases ct-cases-earlier">
                    {earlierOther.filter(found).map((c) => (
                      <li key={c.id} className="ct-case" data-status={c.status}>
                        <div className="ct-case-still">
                          <span className="ct-case-body">
                            <span className="ct-case-top">
                              <span className="ct-case-name">{c.subject_name}</span>
                              <span className="ct-status" data-status={c.status}>{standing(c)}</span>
                            </span>
                            <span className="ct-case-meta">Judge: {c.judge_name} · {ago(c.touched_at)}</span>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CaseGroup>
              )}
            </>
          )}
          {needle && shelfSize > 0 && !(shelf === 'now' ? [...nowMine, ...ruledLately, ...nowWatch] : [...earlierMine, ...earlierOther]).some(found) && (
            <p className="ct-empty">No case matches &ldquo;{find.trim()}&rdquo;.</p>
          )}
        </div>
      )}
    </div>
  );
}

const RULED_LATELY_MS = 7 * 86_400_000;

const VERDICT_SHORT: Record<string, string> = {
  dismissed: 'Dismissed', counselled: 'Counselled', suspended: 'Suspended', removed: 'Removed',
};

/** Where a case stands, in a few words for the list. */
function standing(c: CourtCaseRow): string {
  if (c.status === 'open') return 'In session';
  if (c.status === 'with_board') return 'With the Church Board';
  return `Ruled: ${VERDICT_SHORT[c.verdict ?? ''] ?? c.verdict ?? ''}`;
}

const PLACE_SHORT: Record<string, string> = {
  judge: 'You judge it', opener: 'You brought it', accused: 'It is about you',
  reporter: 'You raised it', witness: 'You are a witness', observer: 'You are watching',
};

/** When something last happened in it, as people say it. */
function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s)) return '';
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) { const h = Math.floor(s / 3600); return `${h} hour${h === 1 ? '' : 's'} ago`; }
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function CaseGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="ct-group-title">{title}</h3>
      {children}
    </section>
  );
}

/** One of your cases: the whole row opens it. */
function CaseRow({ c, onOpen }: { c: CourtCaseRow; onOpen: () => void }) {
  return (
    <li className="ct-case" data-status={c.status} data-court-case={c.id}>
      <button type="button" className="ct-case-open" onClick={onOpen} aria-label={`Open the case about ${c.subject_name}`}>
        <span className="ct-case-body">
          <span className="ct-case-top">
            <span className="ct-case-name">{c.subject_name}</span>
            <span className="ct-status" data-status={c.status}>{standing(c)}</span>
          </span>
          {c.summary && <span className="ct-case-summary">{c.summary}</span>}
          <span className="ct-case-meta">
            {PLACE_SHORT[c.my_place ?? ''] ?? ''} · Judge: {c.judge_name} · {c.statements} said · {c.exhibits} exhibit{c.exhibits === 1 ? '' : 's'} · {ago(c.touched_at)}
          </span>
        </span>
        <ChevronGlyph size={22} className="ct-case-go" />
      </button>
    </li>
  );
}

// ---------------------------------------------------------- opening one ----

/** Profiles carry their church in the database; the shared type does not name it. */
const churchOf = (p: Profile) => (p as Profile & { church_id?: string | null }).church_id ?? null;

function OpenCase({ me, preselected, onOpened, onLocked }: {
  me: Profile;
  preselected: string;
  onOpened: (id: string) => void | Promise<void>;
  onLocked: () => void;
}) {
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [everyone, setEveryone] = useState<Profile[]>([]);
  const [subject, setSubject] = useState(preselected);
  const [other, setOther] = useState('');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const rows = (await live.listMembers()).filter((p) => p.id !== me.id && p.is_approved);
        // Ask the database who this person may open a case about, once each,
        // rather than guessing the rule a second time here.
        const verdicts = await Promise.all(rows.map(async (p) => [p.id, await live.disciplineCheck(p.id)] as const));
        const allowed = new Set(verdicts.filter(([, v]) => v === 'ok').map(([id]) => id));
        setPeople(rows.filter((p) => allowed.has(p.id)));
        // Who raised it can be anybody in the church, a Director included.
        setEveryone(rows);
      } catch (cause) {
        setPeople([]);
        setError(humanError(cause, 'The members could not be loaded.'));
      }
    })();
  }, [me.id]);

  const open = async () => {
    setError('');
    if (!subject) { setError('Choose who the case is about.'); return; }
    if (!summary.trim()) { setError('Say what the case is about.'); return; }
    setBusy(true);
    try {
      const id = await courtOpen({ subjectId: subject, summary, otherId: other || null });
      await onOpened(id);
    } catch (cause) {
      if (isCourtLocked(cause)) { onLocked(); return; }
      setError(humanError(cause, 'The case could not be opened.'));
    } finally {
      setBusy(false);
    }
  };

  const pick = people?.find((p) => p.id === subject);
  return (
    <div data-court-open>
      <Card className="p-4">
        <h2 className="text-lg font-bold text-navy" style={{ fontFamily: 'Georgia, serif' }}>Open a case</h2>
        <p className="ct-hint">
          You present it. Its judge is drawn at random from the church&rsquo;s leaders free to hear it: never you unless
          nobody else is free, never anybody in it. The person it is about is told and can answer it here, and so is
          anybody you name as having raised it. The hearing ends with the judge&rsquo;s recommendation, and the Church
          Board gives the final ruling.
        </p>
        {!people ? <BeaconSpinner inline label="Loading the members" /> : (
          <>
            <label className="ct-field">
              <span>Who is it about?</span>
              <select value={subject} onChange={(e) => setSubject(e.target.value)} data-court-subject>
                <option value="">Choose somebody</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({roleNoun(p.role)})</option>)}
              </select>
            </label>
            {preselected && !pick && (
              <p className="ct-hint">That person is not somebody you can open a case about.</p>
            )}
            <label className="ct-field">
              <span>What is it about? <span className="font-normal">(kept on the record)</span></span>
              <textarea rows={3} maxLength={2000} value={summary} onChange={(e) => setSummary(e.target.value)}
                        placeholder="Sent something inappropriate to an Explorer." data-court-summary />
            </label>
            <label className="ct-field">
              <span>Who raised it? <span className="font-normal">(optional, from this church)</span></span>
              <select value={other} onChange={(e) => setOther(e.target.value)}>
                <option value="">Nobody to name</option>
                {everyone
                  .filter((p) => p.id !== subject && (!pick || churchOf(p) === churchOf(pick)))
                  .map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </label>
            <div className="mt-3">
              <Button variant="gold" disabled={busy || !subject || !summary.trim()} onClick={() => void open()}>
                {busy ? 'Opening it' : 'Open the case'}
              </Button>
            </div>
          </>
        )}
        {error && <p className="ct-finding ct-finding-bad" role="alert">{error}</p>}
      </Card>
    </div>
  );
}

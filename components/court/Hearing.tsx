'use client';

// One case, as a hearing.
//
// SIMPLE, BY DEFAULT: the bench (who it is about, who judges it), the live
// session (everybody in the room as an avatar, components/court/CourtStage),
// how it ended, once it has, and then four tabs: the record (what was said,
// numbered like a transcript, and the witness stand to say your piece), the
// clerk's table (exhibits), the desk (the judge's, or the Church Board's
// ruling, for whoever writes it down) and tools (check the record, keep a
// copy). Where the case is wide, the tabs go and it is two columns.
//
// ON EVERY SCREEN (asked for on 21 October 2026). The tabs are the default
// and the two columns are the container query (court.css), so a phone, a pad
// and a computer whose rails leave the case 620px all get tabs, and a browser
// without container queries still gets tabs that work. What an act did is
// said in a message pinned above the bottom bar, where the person is looking.
//
// HOW A CASE ENDS (20261020200000). The judge, drawn at random, ends the
// hearing with a recommendation; nothing happens to anybody's account. The
// Church Board gives the final ruling outside the court room, and the judge
// or a leader who sat on the case writes it down here, which is when a
// suspension or a removal is carried out, if it is.
//
// THE JUDGE'S DESK HAS SIMPLE AND ADVANCED (asked for on 21 October 2026).
// Simple is what every hearing needs: leave to answer when somebody called is
// suspended, call a witness, end the hearing, step down. Advanced adds the
// rest, each folded until wanted: write down what somebody said for them,
// hear it in private, ask an Executive Director to take the seat. It is the
// same setting as the room's Advanced settings switch.
//
// ADVANCED, A TICK AWAY (the same Advanced settings tick as elsewhere in the
// app): every fingerprint, compare a file with the exhibits, check the
// judge's draw, and read the chain of custody.
//
// WHO SEES WHAT IS THE DATABASE'S ANSWER. This screen draws what court_case
// returned: a person called to the case gets no gallery and no custody chain,
// because the database sends them none.
//
// LEAVE TO ANSWER. Somebody called to the case whose account is suspended
// cannot sign in. The judge can let them in for this case alone (the panel
// below the record); the database lifts the switch, keeps everything else
// shut, and ends it when the judge does, when its time runs out or at the
// end of the hearing. An account that has been deleted keeps its name here, marked
// "(account deleted)" by the database.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { ChevronGlyph, CloseGlyph } from '@/components/Glyph';
import { Gavel, Seal, StandRail } from '@/components/court/CourtFurniture';
import { ClerksTable, SameFileCheck } from '@/components/court/Exhibits';
import { CourtStage } from '@/components/court/CourtStage';
import {
  courtCallJudge, courtCase, courtCheckRecord, courtCloseHearing, courtEndLeave, courtExported, courtGallery,
  courtGrantLeave, courtHere, courtRecordFor, courtRecordRuling, courtSay, courtStepDown, courtSummon,
  isCourtLocked, LEAVE_HOURS,
  type CourtCaseFull, type CourtPerson, type CourtRecommendation, type CourtRuling, type LeaveHours, type RecordCheck,
} from '@/lib/live/court';
import { ACT_WORDS, checkChain, checkDraw, shortFingerprint, type ChainCheck, type DrawCheck } from '@/lib/court/forensics';
import { recordText } from '@/lib/court/record-text';
import { humanError } from '@/lib/live/errors';
import { useKeepUp, KEEP_UP_CASES } from '@/lib/live/keep-up';
import { downloadBlob } from '@/lib/pdf';
import * as live from '@/lib/live/data';
import type { Profile } from '@/lib/types';

const PLACE_WORDS: Record<string, string> = {
  judge: 'You are the judge',
  opener: 'You brought this case',
  accused: 'This case is about you',
  reporter: 'You raised this',
  witness: 'You are a witness',
  observer: 'You are watching from the gallery',
};

const VERDICT_WORDS: Record<string, string> = {
  dismissed: 'Dismissed',
  counselled: 'Counselled',
  suspended: 'Suspended',
  removed: 'Removed from the church',
};

const RECOMMEND_WORDS: Record<CourtRecommendation, string> = {
  dismiss: 'Dismiss the case',
  counsel: 'Counsel, with no change to their account',
  suspend: 'Suspend them',
  remove: 'Remove them from the church',
};

const RULING_WORDS: Record<CourtRuling, string> = {
  dismissed: 'Dismissed',
  counselled: 'Counselled, with no change to their account',
  suspended: 'Suspended',
  removed: 'Removed from the church',
};

/** Today, as the date input wants it, on this device's calendar. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const LEAVE_WORDS: Record<LeaveHours, string> = {
  1: 'For an hour',
  24: 'For a day',
  72: 'For three days',
  168: 'For a week',
};

type Tab = 'record' | 'exhibits' | 'desk' | 'tools';

export function Hearing({ id, me, advanced, onAdvanced, onLocked, onChanged, poll = false }: {
  id: string;
  me: Profile;
  advanced: boolean;
  /** Turns Advanced settings on from the Tools tab, where there is a switch for it. */
  onAdvanced?: (on: boolean) => void;
  onLocked: () => void;
  onChanged: () => void | Promise<void>;
  /**
   * Read the case again every twenty seconds even when it is not in session.
   * For somebody answering on leave, whose account the live connection keeps
   * shut, so they would hear of nothing that happens unless they ask. A case
   * in session is read again on that timer for everybody, so the room shows
   * who has come and gone.
   */
  poll?: boolean;
}) {
  const [full, setFull] = useState<CourtCaseFull | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState('');
  const [check, setCheck] = useState<RecordCheck | null>(null);
  const [chain, setChain] = useState<ChainCheck | null>(null);
  const [tab, setTab] = useState<Tab>('record');
  const tabsRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      setFull(await courtCase(id));
      setError('');
    } catch (cause) {
      if (isCourtLocked(cause)) { onLocked(); return; }
      setError(humanError(cause, 'This case could not be opened.'));
    }
  }, [id, onLocked]);

  useEffect(() => { void load(); }, [load]);
  // Every act in a case touches the case's row, so this hears all of them.
  useKeepUp(KEEP_UP_CASES, load);
  const inSession = full?.case.status === 'open';
  useEffect(() => {
    if (!poll && !inSession) return;
    const timer = window.setInterval(() => { void load(); }, 20_000);
    return () => window.clearInterval(timer);
  }, [poll, inSession, load]);
  // "I am here", while the hearing is in session and this screen is in front
  // of somebody. A database without the update has no court_here: say
  // nothing about it, the room still works.
  useEffect(() => {
    if (!inSession) return;
    let gone = false;
    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      courtHere(id).catch((cause) => { if (!gone && isCourtLocked(cause)) onLocked(); });
    };
    beat();
    const timer = window.setInterval(beat, 25_000);
    return () => { gone = true; window.clearInterval(timer); };
  }, [id, inSession, onLocked]);
  useEffect(() => { setCheck(null); setChain(null); setTab('record'); }, [id]);
  // Good news goes away on its own; a refusal stays until it is read.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Every act goes through here: one place for "busy", the refusal sentence,
  // a shut door, and reading the case again afterwards.
  const act = async (label: string, fn: () => Promise<string | void>, done: string) => {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      const answer = await fn();
      if (typeof answer === 'string' && answer !== 'ok') { setError(answer); return; }
      setNotice(done);
      await load();
      await onChanged();
    } catch (cause) {
      if (isCourtLocked(cause)) { onLocked(); return; }
      setError(humanError(cause, 'That did not work.'));
    } finally {
      setBusy('');
    }
  };

  if (error && !full) return <p className="ct-finding ct-finding-bad">{error}</p>;
  if (!full) return <p className="text-sm text-[#4a4f63]">Opening the case&hellip;</p>;

  const c = full.case;
  const bench = c.my_place === 'judge' || c.my_place === 'opener' || c.my_place === 'observer';

  const checkRecord = async () => {
    setBusy('Checking the record');
    try {
      const answer = await courtCheckRecord(c.id);
      setCheck(answer);
      if (full.record) setChain(await checkChain(c.id, full.record));
    } catch (cause) {
      if (isCourtLocked(cause)) { onLocked(); return; }
      setError(humanError(cause, 'The record could not be checked.'));
    } finally {
      setBusy('');
    }
  };

  const saveCopy = async () => {
    setBusy('Saving a copy');
    try {
      const answer = await courtCheckRecord(c.id).catch(() => null);
      await courtExported(c.id);
      const text = recordText(full, answer, me.full_name || 'Someone');
      const name = `record-${c.subject_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${c.id.slice(0, 8)}.txt`;
      downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), name);
      await load();
    } catch (cause) {
      if (isCourtLocked(cause)) { onLocked(); return; }
      setError(humanError(cause, 'A copy could not be saved.'));
    } finally {
      setBusy('');
    }
  };

  // THE DESK: the judge's while the hearing is in session; afterwards, the
  // place to write the Church Board's ruling down, for whoever may.
  const desk: 'judge' | 'board' | null = c.status === 'open' && c.may_decide ? 'judge' : c.may_record_ruling ? 'board' : null;
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'record', label: 'Record', count: full.statements.length },
    { key: 'exhibits', label: 'Exhibits', count: full.exhibits.length },
    ...(desk ? [{ key: 'desk' as Tab, label: desk === 'judge' ? 'Desk' : 'Ruling' }] : []),
    { key: 'tools', label: 'Tools' },
  ];
  const active: Tab = tabs.some((t) => t.key === tab) ? tab : 'record';
  const show = (key: Tab) => {
    setTab(key);
    // Switching tabs from far down a long record starts the new one at its top.
    window.requestAnimationFrame(() => {
      const bar = tabsRef.current;
      const stuck = bar ? bar.getBoundingClientRect().top <= (parseFloat(getComputedStyle(bar).top) || 0) + 1 : false;
      if (stuck) document.getElementById(`ct-${c.id}-${key}`)?.scrollIntoView({ block: 'start' });
    });
  };
  const panel = (key: Tab, children: React.ReactNode) => (
    <div key={key} id={`ct-${c.id}-${key}`} className="ct-panel" role="tabpanel" data-active={active === key} data-court-panel={key}>
      {children}
    </div>
  );

  return (
    <section className="ct-hearing" data-court-hearing={c.id}>
      <div className="ct-bench">
        <div className="flex items-start gap-3">
          <Seal className="ct-seal hidden sm:block" />
          <div className="min-w-0 flex-1 pr-0 sm:pr-16">
            <p className="ct-kicker">In the matter of</p>
            <h2>{c.subject_name}</h2>
            <p className="ct-summary">{c.summary}</p>
            <p className="ct-meta">
              Judge: {c.judge_name} &middot; Brought on {when(c.opened_at)} by {c.opener_name}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {c.status === 'open' && <span className="ct-chip ct-chip-session">In session</span>}
              {c.status === 'with_board' && <span className="ct-chip ct-chip-decided" data-court-status="with_board">Heard &middot; with the Church Board</span>}
              {c.status === 'closed' && (
                <span className="ct-chip ct-chip-decided" data-court-status="closed">
                  {c.ruling_words ? 'Ruled by the Church Board' : 'Decided'}: {VERDICT_WORDS[c.verdict ?? ''] ?? c.verdict}
                </span>
              )}
              <span className="ct-chip ct-chip-place" data-court-place={c.my_place}>{PLACE_WORDS[c.my_place]}</span>
              {c.i_lead && c.escalation === 'requested' && (
                <span className="ct-chip ct-chip-place">An Executive Director has been asked</span>
              )}
              {!c.gallery_open && <span className="ct-chip ct-chip-place">Heard in private</span>}
              {c.my_leave_until && (
                <span className="ct-chip ct-chip-place" data-court-my-leave>You may answer until {when(c.my_leave_until)}</span>
              )}
            </div>
            {c.status === 'closed' && !c.ruling_words && c.verdict_note && <p className="ct-meta">The judge&rsquo;s reason: {c.verdict_note}</p>}
            {c.seal_hash && (
              <p className="ct-meta">
                Sealed{advanced && <> &middot; <span className="ct-print text-[#e3d2ad]">{shortFingerprint(c.seal_hash)}</span></>}
              </p>
            )}
          </div>
        </div>
        <Gavel className="ct-gavel" />
      </div>

      <CourtStage full={full} meId={me.id} />

      {/* HOW IT ENDED, where nobody has to look for it. */}
      <div className="ct-outcome">
        {c.status === 'with_board' && (
          <div className="ct-desk" data-court-with-board>
            <h3 className="ct-section-title">With the Church Board</h3>
            <p className="ct-hint">
              The hearing ended {c.heard_at ? when(c.heard_at) : ''}. The Church Board gives the final ruling, outside the court room;
              nothing happens to anybody&rsquo;s account until it has.
            </p>
            {c.recommendation && (
              <p className="mt-2 text-sm" data-court-recommendation>
                <strong>The judge recommends:</strong> {RECOMMEND_WORDS[c.recommendation]}
                {c.recommendation_note ? ` -- ${c.recommendation_note}` : ''}
              </p>
            )}
          </div>
        )}
        {c.status === 'closed' && c.ruling_words && (
          <div className="ct-desk" data-court-ruling>
            <h3 className="ct-section-title">The ruling of the Church Board</h3>
            <p className="text-lg font-bold" style={{ fontFamily: 'Georgia, serif' }}>{VERDICT_WORDS[c.verdict ?? ''] ?? c.verdict}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{c.ruling_words}</p>
            <p className="ct-hint mt-2">
              Presented {c.ruling_presented_on ? new Date(`${c.ruling_presented_on}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''}
              {c.ruling_presented_by ? ` by ${c.ruling_presented_by}` : ''}. Written down by {c.ruling_recorded_name ?? 'Someone'}.
            </p>
          </div>
        )}
      </div>

      <div ref={tabsRef} className="ct-tabs compact-ui" role="tablist" aria-label="This case">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" className="ct-tab" aria-selected={active === t.key}
                  aria-controls={`ct-${c.id}-${t.key}`} onClick={() => show(t.key)} data-court-tab={t.key}>
            {t.label}
            {t.count !== undefined && <span className="ct-count">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="ct-cols">
        <div className="ct-col">
          {panel('record', (
            <div className="ct-record" data-court-record>
              <h3 className="ct-section-title">The record &middot; what was said</h3>
              {full.statements.length === 0 ? (
                <p className="text-sm text-[#4a4f63]">Nobody has spoken yet.</p>
              ) : (
                <ol className="ct-entries">
                  {full.statements.map((s, i) => (
                    <li key={s.id} className="ct-entry">
                      <span className="ct-entry-n" aria-hidden>{i + 1}</span>
                      <span className="ct-entry-who">
                        {s.for_name ? `${s.for_name}, written down by ${s.author_id === me.id ? 'you' : s.author_name}` : s.author_id === me.id ? 'You' : s.author_name}
                      </span>{' '}
                      <span className="ct-entry-when">{when(s.at)}</span>
                      <p className="ct-entry-body">{s.body}</p>
                      {advanced && <span className="ct-print">SHA-256 {shortFingerprint(s.sha256)}</span>}
                    </li>
                  ))}
                </ol>
              )}

              {c.may_speak && (
                <div className="ct-stand">
                  <label className="block">
                    <span className="text-sm font-semibold">
                      {c.my_place === 'judge' ? 'Speak from the bench' : c.my_place === 'opener' ? 'Present the case' : 'Say your piece'}
                    </span>
                    <textarea
                      data-court-say
                      rows={3}
                      value={draft}
                      maxLength={4000}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={c.my_place === 'judge' ? 'A question, or what happens next.'
                        : c.my_place === 'opener' ? 'Why this case was brought, and what the court should look at.'
                        : 'Tell the court what happened, in your own words.'}
                    />
                  </label>
                  <StandRail className="ct-rail" />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <Button
                      variant="gold"
                      disabled={Boolean(busy) || !draft.trim()}
                      onClick={() => void act('Adding it', async () => { await courtSay(c.id, draft); setDraft(''); }, 'It is on the record.')}
                    >
                      Add to the record
                    </Button>
                    {draft.length > 3500 && <span className="ct-hint">{4000 - draft.length} characters left</span>}
                  </div>
                </div>
              )}
              {!c.may_speak && c.status === 'open' && c.my_place === 'observer' && (
                <p className="ct-hint mt-3">Watching from the gallery is silent: only the judge and the people called speak here.</p>
              )}
            </div>
          ))}

          {desk && panel('desk', (
            <div className="grid gap-3">
              {/* SIMPLE AND ADVANCED, FOR THE JUDGE (asked for on 21 October
                  2026). The same setting as the room's Advanced settings
                  switch, so the two can never disagree. */}
              {desk === 'judge' && onAdvanced && (
                <div className="ct-desk-mode" data-court-desk-modes>
                  <div className="ct-shelves" role="group" aria-label="How much the desk shows">
                    <button type="button" className="ct-shelf" aria-pressed={!advanced}
                            onClick={() => onAdvanced(false)} data-court-desk-mode="simple">Simple</button>
                    <button type="button" className="ct-shelf" aria-pressed={advanced}
                            onClick={() => onAdvanced(true)} data-court-desk-mode="advanced">Advanced</button>
                  </div>
                  <p className="ct-hint">
                    {advanced
                      ? 'Every tool the judge has, and every fingerprint.'
                      : 'What every hearing needs: call a witness, and end the hearing. Writing down what somebody said, hearing it in private and asking for another judge are under Advanced.'}
                  </p>
                </div>
              )}

              {c.may_decide && (
                <LeaveToAnswer people={full.people} busy={busy}
                  grant={(person, name, hours) => void act('Giving leave', () => courtGrantLeave(c.id, person, hours),
                    `${name} may now sign in and answer this case, and nothing else. Tell them yourself; they are told in the app too.`)}
                  end={(person, name) => void act('Ending it', () => courtEndLeave(c.id, person),
                    `${name} can no longer sign in.`)} />
              )}

              {desk === 'judge' && <JudgeTools full={full} me={me} busy={busy} act={act} advanced={advanced} />}

              {c.may_decide && (c.may_step_down === undefined ? (
                // A database with the court room but not its newest update: the
                // judge decided there, which the Church Board now does.
                <p className="ct-finding ct-finding-bad" data-court-needs-update>
                  Ending a hearing waits for your church&rsquo;s database to have its newest update, so the Church Board can give the final ruling.
                </p>
              ) : (
                <HearingDesk
                  busy={busy}
                  subject={c.subject_name}
                  subjectSuspended={Boolean(c.subject_suspended)}
                  subjectDeleted={Boolean(c.subject_deleted)}
                  close={(recommendation, note) => void act('Ending the hearing', () => courtCloseHearing(c.id, recommendation, note),
                    'The hearing has ended and its record is sealed. The Church Board gives the final ruling.')}
                  stepDown={(why) => void act('Stepping down', () => courtStepDown(c.id, why),
                    'You have stepped down. Another judge has been drawn, or the seat waits until one is free.')}
                />
              ))}

              {c.may_record_ruling && (
                <BoardRuling
                  busy={busy}
                  subject={c.subject_name}
                  subjectDeleted={Boolean(c.subject_deleted)}
                  record={(args) => void act('Writing it down', () => courtRecordRuling({ trialId: c.id, ...args }),
                    args.carryOut ? 'The Church Board\'s ruling is on the record, and it has been carried out.' : 'The Church Board\'s ruling is on the record.')}
                />
              )}
            </div>
          ))}
        </div>

        <div className="ct-col">
          {panel('exhibits', (
            <ClerksTable
              trialId={c.id}
              exhibits={full.exhibits}
              mayPresent={c.may_present}
              onBench={bench}
              advanced={advanced}
              onChanged={async () => { await load(); await onChanged(); }}
            />
          ))}

          {panel('tools', (
            <div className="ct-desk" data-court-tools>
              <h3 className="ct-section-title">Tools</h3>
              <div className="ct-tool">
                <p className="ct-tool-title">Does the record hold?</p>
                <p className="ct-hint mb-2">Checks every entry, statement and exhibit against the fingerprint it was given.</p>
                <Button variant="ghost" disabled={Boolean(busy)} onClick={() => void checkRecord()}>Check the record</Button>
                {check && (
                  <p className={`ct-finding ${check.holds && check.seal_holds ? 'ct-finding-good' : 'ct-finding-bad'}`} data-court-check={check.holds ? 'holds' : 'broken'}>
                    {check.holds && check.seal_holds
                      ? `It holds: ${check.entries} entries, each chained to the one before, and every statement and exhibit still matches its fingerprint.`
                      : `It does not hold${check.broken_at ? `: the chain breaks at entry ${check.broken_at}` : ''}${check.statements_differing ? `; ${check.statements_differing} statement(s) changed` : ''}${check.exhibits_differing ? `; ${check.exhibits_differing} exhibit(s) changed` : ''}. Tell whoever looks after your church’s database.`}
                  </p>
                )}
                {chain && (
                  <p className={`ct-finding ${chain.holds ? 'ct-finding-good' : 'ct-finding-bad'}`}>
                    {chain.holds
                      ? `Checked again on this device, without trusting the server: ${chain.entries} entries hold.`
                      : `On this device, the chain breaks at entry ${chain.brokenAt}.`}
                  </p>
                )}
              </div>
              <div className="ct-tool">
                <p className="ct-tool-title">Keep a copy</p>
                <p className="ct-hint mb-2">A plain text file with every fingerprint, and how to check them. Saving it is written on the record.</p>
                <Button variant="ghost" disabled={Boolean(busy)} onClick={() => void saveCopy()}>Save a copy of the record</Button>
              </div>
              {advanced ? (
                <ForensicTools full={full} />
              ) : onAdvanced && (
                <div className="ct-tool">
                  <p className="ct-hint">
                    Comparing a file with the exhibits, checking how the judge was drawn and the chain of custody are
                    under Advanced settings.
                  </p>
                  <button type="button" className="ct-plain-button mt-1" onClick={() => onAdvanced(true)}>
                    Turn on Advanced settings
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {(error || notice) && (
        <div className="ct-toast compact-ui" role={error ? 'alert' : 'status'} data-court-toast={error ? 'bad' : 'good'}>
          <span>{error || notice}</span>
          <button type="button" className="ct-toast-x" aria-label="Dismiss" onClick={() => { setError(''); setNotice(''); }}>
            <CloseGlyph size={18} />
          </button>
        </div>
      )}
    </section>
  );
}

// --------------------------------------------- the end of the hearing ----

/**
 * For the judge: end the hearing with a recommendation, or step down. Ending
 * it touches nobody's account; the Church Board rules afterwards.
 */
function HearingDesk({ busy, subject, subjectSuspended, subjectDeleted, close, stepDown }: {
  busy: string;
  subject: string;
  subjectSuspended: boolean;
  subjectDeleted: boolean;
  close: (recommendation: CourtRecommendation, note: string) => void;
  stepDown: (why: string) => void;
}) {
  const [recommendation, setRecommendation] = useState<CourtRecommendation>('dismiss');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [why, setWhy] = useState('');
  const [leaving, setLeaving] = useState(false);
  return (
    <div className="ct-desk mt-3" data-court-decide>
      <h3 className="ct-section-title">End the hearing</h3>
      <p className="ct-hint">
        When everybody has been heard, end the hearing with what you recommend. Its record is sealed and nothing more can be
        said. The Church Board gives the final ruling, outside this room: nothing happens to {subject}&rsquo;s account until it has.
      </p>
      {subjectSuspended && (
        <p className="ct-hint">Their account is suspended now, as a precaution. Ending the hearing does not lift that: a Director lifts it from their page.</p>
      )}
      {subjectDeleted && (
        <p className="ct-hint">Their account has been deleted. The case and its record stay; there is nothing left to carry out.</p>
      )}
      <label className="ct-field">
        <span>You recommend</span>
        <select value={recommendation} onChange={(e) => { setRecommendation(e.target.value as CourtRecommendation); setConfirm(false); }} data-court-recommend>
          {(Object.keys(RECOMMEND_WORDS) as CourtRecommendation[]).map((r) => <option key={r} value={r}>{RECOMMEND_WORDS[r]}</option>)}
        </select>
      </label>
      <label className="ct-field">
        <span>Why <span className="font-normal">(for the Church Board, kept with the record)</span></span>
        <textarea rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="Both sides were heard, and the exhibits match." />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {!confirm ? (
          <Button variant="gold" disabled={Boolean(busy)} onClick={() => setConfirm(true)}>End the hearing</Button>
        ) : (
          <>
            {/* The marker on a wrapper: Button keeps a fixed list of props and drops the rest. */}
            <span data-court-end-hearing>
              <Button variant="gold" disabled={Boolean(busy)} onClick={() => close(recommendation, note)}>
                Yes, end it and send it to the Board
              </Button>
            </span>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Not yet</Button>
          </>
        )}
      </div>

      <div className="mt-4 border-t border-[#e2d6bb] pt-3">
        <button type="button" className="ct-plain-button" onClick={() => setLeaving(!leaving)}>
          {leaving ? 'Keep the seat' : 'Step down as judge'}
        </button>
        {leaving && (
          <div className="mt-2">
            <p className="ct-hint">
              If you cannot hear this case fairly, step down. Another judge is drawn at random from the leaders free to hear it,
              and your reason is on the record.
            </p>
            <label className="ct-field">
              <span className="sr-only">Why you are stepping down</span>
              <input value={why} maxLength={500} onChange={(e) => setWhy(e.target.value)} placeholder="I know them too well to judge this." />
            </label>
            <div className="mt-2">
              <span data-court-step-down>
                <Button variant="ghost" disabled={Boolean(busy)} onClick={() => stepDown(why)}>Step down</Button>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------- the Church Board's ruling ----

/**
 * For the judge, or a leader who sat on the case: write the Church Board's
 * ruling down as it was given, and carry it out if it says to.
 */
function BoardRuling({ busy, subject, subjectDeleted, record }: {
  busy: string;
  subject: string;
  subjectDeleted: boolean;
  record: (args: { ruling: CourtRuling; words: string; presentedBy: string; presentedOn: string; carryOut: boolean }) => void;
}) {
  const [ruling, setRuling] = useState<CourtRuling>('dismissed');
  const [words, setWords] = useState('');
  const [by, setBy] = useState('The Church Board');
  const [on, setOn] = useState(today());
  const [carryOut, setCarryOut] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const acts = ruling === 'suspended' || ruling === 'removed';
  return (
    <div className="ct-desk mt-3" data-court-board>
      <h3 className="ct-section-title">The Church Board&rsquo;s ruling</h3>
      <p className="ct-hint">
        The Church Board has the final word, and gives it outside the court room. When it has, write its ruling down here as
        it was given. It goes on the record after the seal.
      </p>
      <label className="ct-field">
        <span>The Board ruled</span>
        <select value={ruling} onChange={(e) => { setRuling(e.target.value as CourtRuling); setConfirm(false); }} data-court-ruling-outcome>
          {(Object.keys(RULING_WORDS) as CourtRuling[]).map((r) => <option key={r} value={r}>{RULING_WORDS[r]}</option>)}
        </select>
      </label>
      <label className="ct-field">
        <span>In the Board&rsquo;s own words</span>
        <textarea rows={3} value={words} maxLength={4000} onChange={(e) => setWords(e.target.value)} data-court-ruling-words
                  placeholder="What the Board decided, and anything it asked to be done." />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="ct-field">
          <span>Presented by</span>
          <input value={by} maxLength={200} onChange={(e) => setBy(e.target.value)} />
        </label>
        <label className="ct-field">
          <span>On</span>
          <input type="date" value={on} max={today()} onChange={(e) => setOn(e.target.value)} />
        </label>
      </div>
      {acts && !subjectDeleted && (
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={carryOut} onChange={(e) => setCarryOut(e.target.checked)} data-court-carry-out />
          <span>
            <strong>Carry it out now.</strong> {ruling === 'suspended'
              ? `${subject}'s account is switched off until a Director lifts it.`
              : `${subject} is removed from the church and their account deleted. The case and its record stay.`}
            {' '}Leave this unticked to do it later from their page.
          </span>
        </label>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!confirm ? (
          <Button variant="gold" disabled={Boolean(busy) || !words.trim()} onClick={() => setConfirm(true)}>Write the ruling down</Button>
        ) : (
          <>
            <span data-court-record-ruling>
              <Button variant={acts && carryOut ? 'danger' : 'gold'} disabled={Boolean(busy)}
                      onClick={() => record({ ruling, words, presentedBy: by, presentedOn: on, carryOut: acts && carryOut && !subjectDeleted })}>
                {acts && carryOut && !subjectDeleted ? 'Yes, write it down and carry it out' : 'Yes, write it down'}
              </Button>
            </span>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Not yet</Button>
          </>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------- leave to answer ----

/**
 * For the judge: everybody called to the case whose account is suspended, and
 * the one thing to do about each. Drawn only when there is somebody to let in.
 */
function LeaveToAnswer({ people, busy, grant, end }: {
  people: CourtPerson[];
  busy: string;
  grant: (person: string, name: string, hours: LeaveHours) => void;
  end: (person: string, name: string) => void;
}) {
  const [hours, setHours] = useState<LeaveHours>(24);
  const shut = people.filter((p) => p.part !== 'observer' && !p.deleted && p.suspended);
  if (shut.length === 0) return null;
  return (
    <div className="ct-desk mt-3" data-court-leave>
      <h3 className="ct-section-title">Leave to answer</h3>
      <p className="ct-hint">
        A suspended account cannot sign in. You can let them in to answer this case and nothing else: the rest of the
        app stays closed to them. The leave ends when you end it, when its time runs out, or when you end the hearing.
        It is written on the record, and your church&rsquo;s leaders are told.
      </p>
      <ul className="mt-2 grid gap-2">
        {shut.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2" data-court-leave-for={p.id}>
            <span className="min-w-0">
              <span className="block font-semibold text-[#1b2442]">{p.name}</span>
              <span className="block text-sm text-[#4a4f63]">
                {p.leave_until ? `May sign in and answer until ${when(p.leave_until)}` : 'Suspended: cannot sign in'}
              </span>
            </span>
            {p.leave_until ? (
              <Button variant="ghost" disabled={Boolean(busy)} onClick={() => end(p.id, p.name)}>End their leave</Button>
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                <label className="ct-field !mt-0">
                  <span className="sr-only">For how long</span>
                  <select value={hours} onChange={(e) => setHours(Number(e.target.value) as LeaveHours)} data-court-leave-hours>
                    {LEAVE_HOURS.map((h) => <option key={h} value={h}>{LEAVE_WORDS[h]}</option>)}
                  </select>
                </label>
                <Button variant="gold" disabled={Boolean(busy)} onClick={() => grant(p.id, p.name, hours)}>Let them answer</Button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------- the judge's tools ----

/**
 * For the judge while the hearing is in session: the lesser tools, each folded
 * until it is wanted, so the desk reads as one decision with help beside it.
 */
function JudgeTools({ full, me, busy, act, advanced }: {
  full: CourtCaseFull;
  me: Profile;
  busy: string;
  act: (label: string, fn: () => Promise<string | void>, done: string) => Promise<void>;
  /** Simple: calling a witness. Advanced: the rest of the judge's tools as well. */
  advanced: boolean;
}) {
  const c = full.case;
  const [members, setMembers] = useState<Profile[] | null>(null);
  const [witness, setWitness] = useState('');
  const [forWho, setForWho] = useState('');
  const [theirWords, setTheirWords] = useState('');

  useEffect(() => {
    live.listMembers()
      .then((rows) => setMembers(rows.filter((p) => p.id !== me.id && p.is_approved
        && !full.people.some((x) => x.id === p.id))))
      .catch(() => setMembers([]));
  }, [me.id, full.people]);

  const callable = full.people.filter((p) => p.part !== 'observer' && !p.deleted);
  const more = (title: string, body: React.ReactNode, mark?: string) => (
    <details className="ct-more" data-court-more={mark}>
      <summary>{title}<ChevronGlyph size={18} className="ct-more-chev" /></summary>
      <div className="ct-more-body">{body}</div>
    </details>
  );

  return (
    <div className="ct-desk" data-court-advanced>
      <h3 className="ct-section-title">The judge&rsquo;s tools</h3>
      {more('Call a witness', (
        <>
          <label className="ct-field !mt-0">
            <span className="sr-only">Who to call</span>
            <select value={witness} onChange={(e) => setWitness(e.target.value)}>
              <option value="">Choose somebody from the church</option>
              {(members ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.suspended_at ? ' (suspended)' : ''}</option>)}
            </select>
          </label>
          <div className="mt-2">
            <Button variant="ghost" disabled={Boolean(busy) || !witness}
                    onClick={() => void act('Calling them', async () => { const r = await courtSummon(c.id, witness); if (r === 'ok') setWitness(''); return r; }, 'They have been called and told.')}>
              Call them
            </Button>
          </div>
        </>
      ), 'witness')}

      {advanced && more('Write down what somebody said', (
        <>
          <label className="ct-field !mt-0">
            <span className="sr-only">Who said it</span>
            <select value={forWho} onChange={(e) => setForWho(e.target.value)}>
              <option value="">Who said it</option>
              {callable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="ct-field">
            <span className="sr-only">What they said</span>
            <textarea rows={3} value={theirWords} maxLength={4000} onChange={(e) => setTheirWords(e.target.value)}
                      placeholder="For somebody who answered in person or by phone, or whose account is suspended." />
          </label>
          <p className="ct-hint">It is recorded as theirs, written down by you.</p>
          <div className="mt-2">
            <Button variant="ghost" disabled={Boolean(busy) || !forWho || !theirWords.trim()}
                    onClick={() => void act('Recording it', async () => { await courtRecordFor(c.id, forWho, theirWords); setTheirWords(''); }, 'It is on the record.')}>
              Put it on the record
            </Button>
          </div>
        </>
      ), 'record-for')}

      {advanced && more('Hear it in private', (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={!c.gallery_open} disabled={Boolean(busy)}
                 onChange={(e) => void act('Changing it', () => courtGallery(c.id, !e.target.checked),
                   e.target.checked ? 'Heard in private from now on: nobody new may watch.' : 'Leadership may watch again.')} />
          <span>Nobody new may take a seat in the gallery. Those already there stay, on the record.</span>
        </label>
      ), 'private')}

      {advanced && me.role === 'admin' && c.escalation !== 'accepted' && more('Ask an Executive Director to judge this', (
        <>
          <Button variant="ghost" disabled={Boolean(busy) || c.escalation === 'requested'}
                  onClick={() => void act('Asking', () => courtCallJudge(c.id), 'An Executive Director has been asked. You stay the judge until one takes the seat.')}>
            {c.escalation === 'requested' ? 'An Executive Director has been asked' : 'Ask an Executive Director'}
          </Button>
          <p className="ct-hint">You keep the seat until one answers. If none does, you go on hearing it.</p>
        </>
      ), 'escalate')}
    </div>
  );
}

// ------------------------------------------- tools for checking evidence ----

/** Under Advanced settings: compare a file, check the judge's draw, read the chain of custody. */
function ForensicTools({ full }: { full: CourtCaseFull }) {
  const c = full.case;
  const [showChain, setShowChain] = useState(false);
  return (
    <>
      <div className="ct-tool">
        <SameFileCheck exhibits={full.exhibits} />
      </div>

      {full.record && full.record.some((r) => r.act === 'judge_drawn') && (
        <div className="ct-tool">
          <DrawCheckPanel trialId={c.id} entries={full.record.filter((r) => r.act === 'judge_drawn')} />
        </div>
      )}

      {full.record && (
        <div className="ct-tool">
          <button type="button" className="ct-plain-button" onClick={() => setShowChain(!showChain)}>
            {showChain ? 'Hide' : 'Show'} the chain of custody ({full.record.length} entries)
          </button>
          {showChain && (
            <ol className="mt-2 grid gap-1.5 text-sm" data-court-chain>
              {full.record.map((r) => (
                <li key={r.seq} className="rounded-lg bg-white p-2 ring-1 ring-[#e2d6bb]">
                  <span className="font-semibold">#{r.seq} {ACT_WORDS[r.act] ?? r.act}</span>{' '}
                  <span className="text-[#4a4f63]">{r.actor_name}, {when(r.at)}</span>
                  {r.detail && <span className="block text-[#232838]">{r.detail}</span>}
                  <span className="ct-print block">{shortFingerprint(r.hash)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Work every draw of this case's judge out again, on this device, from the
 * record alone: who was free, the hash before the draw, and who was drawn.
 */
function DrawCheckPanel({ trialId, entries }: { trialId: string; entries: NonNullable<CourtCaseFull['record']> }) {
  const [results, setResults] = useState<DrawCheck[] | null>(null);
  return (
    <div className="mt-4" data-court-draw-check>
      <button type="button" className="ct-plain-button" onClick={() => void Promise.all(entries.map((e) => checkDraw(trialId, e))).then(setResults)}>
        Check the judge&rsquo;s draw
      </button>
      <p className="ct-hint">Judges are drawn at random from the leaders free to hear a case. This works each draw out again from the record.</p>
      {results && results.map((r, i) => (
        <p key={entries[i].seq} className={`ct-finding ${r.holds ? 'ct-finding-good' : 'ct-finding-bad'}`} data-court-draw={r.holds ? 'holds' : 'broken'}>
          {r.holds
            ? `Draw ${i + 1} holds: ${entries[i].detail.replace(/^Judge drawn at random from \d+ free to hear it: /, '')}, from ${r.from} free to hear it.`
            : `Draw ${i + 1} does not work out from the record. Tell whoever looks after your church's database.`}
        </p>
      ))}
    </div>
  );
}

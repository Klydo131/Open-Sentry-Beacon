'use client';

// One case, as a hearing.
//
// SIMPLE, BY DEFAULT: the bench (who it is about, who judges it), the record
// (what was said, numbered like a transcript), the witness stand (say your
// piece), the clerk's table (exhibits), and for the judge, the decision.
//
// ADVANCED, A TICK AWAY (the same Advanced settings tick as elsewhere in the
// app): call a witness, write down what somebody said for them, ask an
// Executive Director to take the seat, hear it in private, check the record
// on this device, compare a file with the exhibits, save a copy of the
// record, and read the chain of custody.
//
// WHO SEES WHAT IS THE DATABASE'S ANSWER. This screen draws what court_case
// returned: a person called to the case gets no gallery and no custody chain,
// because the database sends them none.
//
// LEAVE TO ANSWER. Somebody called to the case whose account is suspended
// cannot sign in. The judge can let them in for this case alone (the panel
// below the record); the database lifts the switch, keeps everything else
// shut, and ends it when the judge does, when its time runs out or at the
// verdict. An account that has been deleted keeps its name here, marked
// "(account deleted)" by the database.

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { Gavel, GalleryChairs, Seal, StandRail } from '@/components/court/CourtFurniture';
import { ClerksTable, SameFileCheck } from '@/components/court/Exhibits';
import {
  courtCallJudge, courtCase, courtCheckRecord, courtDecide, courtEndLeave, courtExported, courtGallery,
  courtGrantLeave, courtRecordFor, courtSay, courtSummon, isCourtLocked, LEAVE_HOURS,
  type CourtCaseFull, type CourtPerson, type LeaveHours, type RecordCheck,
} from '@/lib/live/court';
import { ACT_WORDS, checkChain, shortFingerprint, type ChainCheck } from '@/lib/court/forensics';
import { recordText } from '@/lib/court/record-text';
import { humanError } from '@/lib/live/errors';
import { useKeepUp, KEEP_UP_CASES } from '@/lib/live/keep-up';
import { downloadBlob } from '@/lib/pdf';
import * as live from '@/lib/live/data';
import type { Profile } from '@/lib/types';

const PLACE_WORDS: Record<string, string> = {
  judge: 'You are the judge',
  opener: 'You opened this case',
  accused: 'This case is about you',
  reporter: 'You raised this',
  witness: 'You are a witness',
  observer: 'You are watching from the gallery',
};

const VERDICT_WORDS: Record<string, string> = {
  dismissed: 'Dismissed',
  suspended: 'Suspended',
  removed: 'Removed from the church',
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const LEAVE_WORDS: Record<LeaveHours, string> = {
  1: 'For an hour',
  24: 'For a day',
  72: 'For three days',
  168: 'For a week',
};

export function Hearing({ id, me, advanced, onLocked, onChanged, poll = false }: {
  id: string;
  me: Profile;
  advanced: boolean;
  onLocked: () => void;
  onChanged: () => void | Promise<void>;
  /**
   * Also read the case again every half minute. For somebody answering on
   * leave, whose account the live connection keeps shut, so they would hear
   * of nothing that happens unless they ask.
   */
  poll?: boolean;
}) {
  const [full, setFull] = useState<CourtCaseFull | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState('');
  const [reason, setReason] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [check, setCheck] = useState<RecordCheck | null>(null);
  const [chain, setChain] = useState<ChainCheck | null>(null);

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
  useEffect(() => {
    if (!poll) return;
    const timer = window.setInterval(() => { void load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [poll, load]);
  useEffect(() => { setCheck(null); setChain(null); setConfirmRemove(false); }, [id]);

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
  const watching = full.people.filter((p) => p.part === 'observer');
  const called = full.people.filter((p) => p.part !== 'observer');

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

  return (
    <section className="ct-wall mt-4" data-court-hearing={c.id}>
      <div className="ct-bench">
        <div className="flex items-start gap-3">
          <Seal className="ct-seal hidden sm:block" />
          <div className="min-w-0 flex-1 pr-0 sm:pr-16">
            <p className="ct-kicker">In the matter of</p>
            <h2>{c.subject_name}</h2>
            <p className="ct-summary">{c.summary}</p>
            <p className="ct-meta">
              Judge: {c.judge_name} &middot; Opened {when(c.opened_at)} by {c.opener_name}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {c.status === 'open'
                ? <span className="ct-chip ct-chip-session">In session</span>
                : <span className="ct-chip ct-chip-decided">Decided: {VERDICT_WORDS[c.verdict ?? ''] ?? c.verdict}</span>}
              <span className="ct-chip ct-chip-place" data-court-place={c.my_place}>{PLACE_WORDS[c.my_place]}</span>
              {c.i_lead && c.escalation === 'requested' && (
                <span className="ct-chip ct-chip-place">An Executive Director has been asked</span>
              )}
              {!c.gallery_open && <span className="ct-chip ct-chip-place">Heard in private</span>}
              {c.my_leave_until && (
                <span className="ct-chip ct-chip-place" data-court-my-leave>You may answer until {when(c.my_leave_until)}</span>
              )}
            </div>
            {c.status === 'closed' && c.verdict_note && <p className="ct-meta">The judge&rsquo;s reason: {c.verdict_note}</p>}
            {c.seal_hash && <p className="ct-meta">Sealed &middot; <span className="ct-print text-[#e3d2ad]">{shortFingerprint(c.seal_hash)}</span></p>}
          </div>
        </div>
        <Gavel className="ct-gavel" />
      </div>

      <div className="ct-floor">
        <div>
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
                    {c.my_place === 'judge' ? 'Speak from the bench' : 'Say your piece'}
                  </span>
                  <textarea
                    data-court-say
                    rows={3}
                    value={draft}
                    maxLength={4000}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={c.my_place === 'judge' ? 'A question, or what happens next.' : 'Tell the court what happened, in your own words.'}
                  />
                </label>
                <StandRail className="ct-rail" />
                <div className="mt-2">
                  <Button
                    variant="gold"
                    disabled={Boolean(busy) || !draft.trim()}
                    onClick={() => void act('Adding it', async () => { await courtSay(c.id, draft); setDraft(''); }, 'It is on the record.')}
                  >
                    Add to the record
                  </Button>
                </div>
              </div>
            )}
            {!c.may_speak && c.status === 'open' && c.my_place === 'observer' && (
              <p className="ct-hint mt-3">Watching from the gallery is silent: only the judge and the people called speak here.</p>
            )}
          </div>

          {c.may_decide && (
            <LeaveToAnswer people={full.people} busy={busy}
              grant={(person, name, hours) => void act('Giving leave', () => courtGrantLeave(c.id, person, hours),
                `${name} may now sign in and answer this case, and nothing else. Tell them yourself; they are told in the app too.`)}
              end={(person, name) => void act('Ending it', () => courtEndLeave(c.id, person),
                `${name} can no longer sign in.`)} />
          )}

          {c.may_decide && (
            <JudgeDesk
              busy={busy}
              reason={reason}
              setReason={setReason}
              confirmRemove={confirmRemove}
              setConfirmRemove={setConfirmRemove}
              subject={c.subject_name}
              subjectSuspended={Boolean(c.subject_suspended)}
              subjectDeleted={Boolean(c.subject_deleted)}
              decide={(verdict, words) => void act('Deciding', () => courtDecide(c.id, verdict, reason), words)}
            />
          )}
        </div>

        <div className="grid gap-3">
          <ClerksTable
            trialId={c.id}
            exhibits={full.exhibits}
            mayPresent={c.may_present}
            onBench={bench}
            advanced={advanced}
            onChanged={async () => { await load(); await onChanged(); }}
          />

          {bench && (
            <div className="ct-gallery" data-court-gallery>
              <h3 className="ct-section-title">The gallery &middot; {watching.length} watching</h3>
              <GalleryChairs taken={watching.length} className="ct-chairs" />
              <p className="ct-names">
                {watching.length ? watching.map((p) => (p.id === me.id ? 'you' : p.name)).join(', ') : 'Nobody is watching.'}
              </p>
              <p className="ct-names">Called: {called.map((p) => `${p.name} (${p.part === 'accused' ? 'the case is about them' : p.part === 'reporter' ? 'raised it' : 'witness'}${p.suspended ? ', suspended' : ''})`).join(', ') || 'nobody'}</p>
            </div>
          )}

          <div className="ct-desk">
            <h3 className="ct-section-title">Does the record hold?</h3>
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

          {advanced && (
            <AdvancedTools
              full={full}
              me={me}
              busy={busy}
              act={act}
              saveCopy={() => void saveCopy()}
            />
          )}
        </div>
      </div>

      {(error || notice) && (
        <div className="bg-[#f4ecdc] px-3 pb-3">
          {error && <p className="ct-finding ct-finding-bad" role="alert">{error}</p>}
          {notice && <p className="ct-finding ct-finding-good" role="status">{notice}</p>}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------- the decision ----

function JudgeDesk({ busy, reason, setReason, confirmRemove, setConfirmRemove, subject, subjectSuspended, subjectDeleted, decide }: {
  busy: string;
  reason: string;
  setReason: (v: string) => void;
  confirmRemove: boolean;
  setConfirmRemove: (v: boolean) => void;
  subject: string;
  subjectSuspended: boolean;
  subjectDeleted: boolean;
  decide: (verdict: 'dismissed' | 'suspended' | 'removed', words: string) => void;
}) {
  return (
    <div className="ct-desk mt-3" data-court-decide>
      <h3 className="ct-section-title">Your decision</h3>
      <p className="ct-hint">Read everything on the record and every exhibit first. A decision closes the case and seals its record.</p>
      {subjectSuspended && (
        <p className="ct-hint">
          Their account is suspended now. Dismissing the case does not lift that: a Director lifts it from their page.
        </p>
      )}
      {subjectDeleted && (
        <p className="ct-hint">Their account has been deleted, so the case can only be dismissed. Its record stays.</p>
      )}
      <label className="ct-field">
        <span>Your reason <span className="font-normal">(kept with the decision)</span></span>
        <input value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} placeholder="Both sides were heard." />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" disabled={Boolean(busy)} onClick={() => decide('dismissed', 'The case is dismissed. Nothing happens to them.')}>
          Dismiss
        </Button>
        <Button variant="gold" disabled={Boolean(busy) || subjectDeleted} onClick={() => decide('suspended', 'They are suspended: their account is switched off until a Director lifts it.')}>
          Suspend them
        </Button>
        <Button variant="danger" disabled={Boolean(busy) || subjectDeleted} onClick={() => setConfirmRemove(!confirmRemove)}>
          Remove from the church
        </Button>
      </div>
      {confirmRemove && (
        <div className="mt-3 rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
          <p className="text-sm font-semibold text-red-900">
            Remove {subject} from the church? This cannot be undone. The case and its record stay.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="danger" disabled={Boolean(busy)} onClick={() => decide('removed', `${subject} has been removed from the church.`)}>
              Yes, remove them
            </Button>
            <Button variant="ghost" onClick={() => setConfirmRemove(false)}>Keep them</Button>
          </div>
        </div>
      )}
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
        app stays closed to them. The leave ends when you end it, when its time runs out, or when you decide the case.
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

// ---------------------------------------------------- advanced settings ----

function AdvancedTools({ full, me, busy, act, saveCopy }: {
  full: CourtCaseFull;
  me: Profile;
  busy: string;
  act: (label: string, fn: () => Promise<string | void>, done: string) => Promise<void>;
  saveCopy: () => void;
}) {
  const c = full.case;
  const judge = c.my_place === 'judge';
  const [members, setMembers] = useState<Profile[] | null>(null);
  const [witness, setWitness] = useState('');
  const [forWho, setForWho] = useState('');
  const [theirWords, setTheirWords] = useState('');
  const [showChain, setShowChain] = useState(false);

  useEffect(() => {
    if (!judge || c.status !== 'open') return;
    live.listMembers()
      .then((rows) => setMembers(rows.filter((p) => p.id !== me.id && p.is_approved
        && !full.people.some((x) => x.id === p.id))))
      .catch(() => setMembers([]));
  }, [judge, c.status, me.id, full.people]);

  const callable = full.people.filter((p) => p.part !== 'observer' && !p.deleted);

  return (
    <div className="ct-desk" data-court-advanced>
      <h3 className="ct-section-title">Advanced settings</h3>

      {judge && c.status === 'open' && (
        <>
          <label className="ct-field">
            <span>Call a witness</span>
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

          <label className="ct-field">
            <span>Write down what somebody said</span>
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

          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={!c.gallery_open} disabled={Boolean(busy)}
                   onChange={(e) => void act('Changing it', () => courtGallery(c.id, !e.target.checked),
                     e.target.checked ? 'Heard in private from now on: nobody new may watch.' : 'Leadership may watch again.')} />
            <span><strong>Hear it in private.</strong> Nobody new may take a seat in the gallery. Those already there stay, on the record.</span>
          </label>

          {me.role === 'admin' && c.escalation !== 'accepted' && (
            <div className="mt-4">
              <Button variant="ghost" disabled={Boolean(busy) || c.escalation === 'requested'}
                      onClick={() => void act('Asking', () => courtCallJudge(c.id), 'An Executive Director has been asked. You stay the judge until one takes the seat.')}>
                {c.escalation === 'requested' ? 'An Executive Director has been asked' : 'Ask an Executive Director to judge this'}
              </Button>
              <p className="ct-hint">You keep the seat until one answers. If none does, you decide the case.</p>
            </div>
          )}
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="ghost" disabled={Boolean(busy)} onClick={saveCopy}>Save a copy of the record</Button>
      </div>
      <p className="ct-hint">A plain text file with every fingerprint, and how to check them. Saving it is written on the record.</p>

      <div className="mt-3">
        <SameFileCheck exhibits={full.exhibits} />
      </div>

      {full.record && (
        <div className="mt-4">
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
    </div>
  );
}

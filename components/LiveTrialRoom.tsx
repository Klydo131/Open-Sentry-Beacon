'use client';

// The trial room.
//
// WHY A CHURCH NEEDS THIS AT ALL. Hope Beacon puts two people in a private
// conversation. Reports (migration 0021) tell the leadership when that goes
// wrong; without this they can read the report and do nothing about it. A
// safeguarding system that ends at "we have been informed" is not one.
//
// TWO ACTS, KEPT SEPARATE ON PURPOSE:
//
//   SUSPEND ("jail")  The account is switched OFF (0026). They stay in the
//                     church and keep their history, and cannot sign in at all;
//                     live sessions are dropped so somebody already signed in
//                     is out at once. Reversible — releasing them switches it
//                     back on. This is both "we are looking into it" and "you
//                     are out until you have spoken to us", and most real
//                     situations are one of those, not expulsion.
//   REMOVE ("kick")   They are gone.
//
// Offering only removal would push a Director towards the harshest option
// because it is the only one; offering only suspension would leave them unable
// to end something that has to end.
//
// WHO MAY DO WHAT IS NOT DECIDED HERE. Every button calls a definer function
// that checks the caller's role against the target's (migration 0023). This
// screen asks the same question first, only so a Director is not shown a
// button that would refuse — an Executive Director may act on anyone in a
// church they oversee (0025); a Director on Guides and Explorers alone; nobody
// on themselves; and nobody at all on the Head Executive Director, who is the
// root of authority and the only account that can appoint executives again.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useKeepUp, KEEP_UP_CASES } from '@/lib/live/keep-up';
import { useCourtEdition } from '@/lib/live/court';
import type { Profile } from '@/lib/types';
import * as live from '@/lib/live/data';
import { roleNoun } from '@/lib/brand';
import { Button, Card } from '@/components/ui';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { humanError } from '@/lib/live/errors';

export function LiveTrialRoom({ me, onCaseOpened }: { me: Profile; onCaseOpened?: () => void }) {
  const [members, setMembers] = useState<Profile[] | null>(null);
  const [allowed, setAllowed] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openFor, setOpenFor] = useState('');
  // Once the church's database has the court room, a trial is opened there,
  // behind its door, rather than from here.
  const edition = useCourtEdition();

  const load = useCallback(async () => {
    try {
      const rows = (await live.listMembers()).filter((m) => m.id !== me.id);
      setMembers(rows);
      // Ask once per person rather than guessing the rule twice.
      const verdicts = await Promise.all(
        rows.map(async (m) => [m.id, await live.disciplineCheck(m.id)] as const),
      );
      setAllowed(Object.fromEntries(verdicts));
    } catch (cause) {
      setMembers([]);
      setError(humanError(cause, 'Could not load the members.'));
    }
  }, [me.id]);

  useEffect(() => { void load(); }, [load]);
  // Several people speak into one hearing, so a stale view is worst here.
  useKeepUp(KEEP_UP_CASES, load);

  // Hold a hearing instead of deciding on the spot. This is the option that
  // should be reached for first in almost every real case, so it is offered
  // alongside the two that act immediately rather than hidden behind them.
  const hold = async (id: string, who: string) => {
    const summary = (reason[id] ?? '').trim();
    if (!summary) { setError('Say what the case is about first.'); return; }
    setBusy(id); setError(''); setNotice('');
    try {
      await live.openTrial({ subjectId: id, summary });
      setNotice(`A case about ${who} is open. They have been told, and can answer it under Cases above.`);
      setOpenFor('');
      setReason((r) => ({ ...r, [id]: '' }));
      onCaseOpened?.();
    } catch (cause) {
      setError(humanError(cause, 'Could not open the case.'));
    } finally { setBusy(''); }
  };

  const act = async (id: string, what: 'suspend' | 'restore' | 'remove', who: string) => {
    setBusy(id); setError(''); setNotice('');
    try {
      const verdict =
        what === 'suspend' ? await live.suspendMember(id, reason[id])
        : what === 'restore' ? await live.restoreMember(id)
        : await live.removeMemberByLeader(id);

      // The database answers with a sentence, not a boolean. Show it.
      if (verdict !== 'ok') { setError(verdict); return; }
      setNotice(
        what === 'suspend' ? `${who} is suspended. They cannot use the app until you lift it.`
        : what === 'restore' ? `${who} can use the app again. Pair them with a Guide when you are ready.`
        : `${who} has been removed from the church.`,
      );
      setOpenFor('');
      await load();
    } catch (cause) {
      setError(humanError(cause, 'That did not work.'));
    } finally { setBusy(''); }
  };

  const actionable = (members ?? []).filter((m) => allowed[m.id] === 'ok');
  const suspended = actionable.filter((m) => m.suspended_at);
  const active = actionable.filter((m) => !m.suspended_at);

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">⚖️ Trial room</h2>
      <p className="mt-1 text-sm text-gray-500">
        {me.role === 'executive'
          ? 'You may suspend or remove anyone in this church. The Head Executive Director is the one exception, so there is always somebody left who can appoint executives.'
          : 'You may suspend or remove Guides and Explorers. Only an Executive Director can act on another Director.'}
      </p>
      <p className="mt-1 text-sm text-gray-500">
        <strong>Suspend</strong> switches their account off. They stay in the
        church and keep their history, and cannot sign in at all until you lift
        it. If they are signed in right now, they are signed out immediately.
        <strong> Remove</strong> is permanent.
      </p>

      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>}
      {notice && <p className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-800 ring-1 ring-green-300">{notice}</p>}

      {suspended.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-amber-700">
            Suspended · {suspended.length}
          </h3>
          <ul className="mt-2 space-y-2">
            {suspended.map((m) => (
              <li key={m.id} className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
                <p className="font-semibold text-navy">{m.full_name}</p>
                <p className="text-sm text-gray-600">{roleNoun(m.role)}</p>
                {m.suspended_reason && (
                  <p className="mt-1 text-sm text-amber-900">“{m.suspended_reason}”</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="gold" disabled={busy === m.id}
                          onClick={() => void act(m.id, 'restore', m.full_name)}>
                    Lift the suspension
                  </Button>
                  <Button variant="danger" disabled={busy === m.id}
                          onClick={() => setOpenFor(openFor === `rm-${m.id}` ? '' : `rm-${m.id}`)}>
                    Remove from the church
                  </Button>
                  {openFor === `rm-${m.id}` && (
                    <Button variant="danger" disabled={busy === m.id}
                            onClick={() => void act(m.id, 'remove', m.full_name)}>
                      Yes, remove {m.full_name}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">
          Members you can act on {members && `· ${active.length}`}
        </h3>
        {!members ? (
          <BeaconSpinner inline label="Loading" className="mt-2" />
        ) : active.length === 0 ? (
          <p className="mt-2 text-gray-500">Nobody.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {active.map((m) => (
              <li key={m.id} className="rounded-xl bg-gray-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block font-semibold text-navy">{m.full_name}</span>
                    <span className="block text-sm text-gray-500">{roleNoun(m.role)}</span>
                  </span>
                  <Button variant="ghost" disabled={busy === m.id}
                          onClick={() => setOpenFor(openFor === m.id ? '' : m.id)}>
                    {openFor === m.id ? 'Cancel' : 'Open a case'}
                  </Button>
                </div>

                {openFor === m.id && (
                  <div className="mt-3 border-t border-black/5 pt-3">
                    <label className="block">
                      <span className="text-sm font-semibold text-navy">
                        What is this about? <span className="font-normal text-gray-500">(kept on the record)</span>
                      </span>
                      <input
                        data-live-case-summary
                        value={reason[m.id] ?? ''}
                        onChange={(e) => setReason((r) => ({ ...r, [m.id]: e.target.value }))}
                        placeholder="Sent something inappropriate to an Explorer"
                        className="tap mt-1 w-full rounded-xl bg-white px-3 text-base outline-none ring-1 ring-gray-300 focus:ring-2 focus:ring-gold"
                      />
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {/* FIRST, and deliberately so. Hearing both people is the
                          normal response to a report; suspending on the spot is
                          for when somebody has to be stopped right now. */}
                      {edition === 'court' ? (
                        <Link
                          href={`/cases?open=${m.id}`}
                          className="inline-flex min-h-[44px] items-center rounded-xl bg-gold px-4 font-bold text-navy"
                        >
                          Hold a trial in the court room
                        </Link>
                      ) : (
                        <Button variant="gold" disabled={busy === m.id}
                                onClick={() => void hold(m.id, m.full_name)}>
                          Hold a trial
                        </Button>
                      )}
                      <Button variant="ghost" disabled={busy === m.id}
                              onClick={() => void act(m.id, 'suspend', m.full_name)}>
                        Suspend now
                      </Button>
                      {/* Removal is deliberately the second press, and never the
                          default. It cannot be undone, and a Director reaching
                          for it in anger is the case this guard exists for. */}
                      <Button variant="danger" disabled={busy === m.id}
                              onClick={() => setOpenFor(`rm-${m.id}`)}>
                        Remove instead
                      </Button>
                    </div>
                  </div>
                )}

                {openFor === `rm-${m.id}` && (
                  <div className="mt-3 rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
                    <p className="text-sm font-semibold text-red-900">
                      Remove {m.full_name} from the church? This cannot be undone.
                      Their conversations go with them.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button variant="danger" disabled={busy === m.id}
                              onClick={() => void act(m.id, 'remove', m.full_name)}>
                        Yes, remove them
                      </Button>
                      <Button variant="ghost" onClick={() => setOpenFor('')}>Keep them</Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The court
// ---------------------------------------------------------------------------
//
// The buttons above stop something immediately. This is for when a Director
// should hear both people first, which is most of the time.
//
// A case is a thread: the Director says what it is about, the accused answers,
// the person who reported speaks, and the head judge decides at the end. What
// was said stays attached to the decision, so somebody reading it in six months
// can see why.
//
// THE JUDGE RULE IN PLAIN WORDS, because directors in their forties are the
// people who will use this and it should not need explaining twice: the
// Director who opens the case is the judge. They can ask an Executive Director
// to take over. If no Executive answers, the Director still decides it — there
// is nothing to wait for and nothing expires.
//
// A SUSPENDED PERSON KEEPS THEIR ANSWER, on purpose, or every case that began
// with a precautionary suspension would only ever hear one side. They cannot
// post it themselves -- a suspended account cannot sign in at all since 0026
// and 20260923164500 -- so in the court room the judge writes down what they
// said, recorded as theirs (court_record_for).

export function LiveCourt({ me, emptyState }: {
  me: Profile;
  /**
   * What to draw when this person has no cases.
   *
   * Nothing, by default: on a dashboard an empty courtroom is a permanent
   * reminder of a proceeding that is not happening. On the Cases room, where a
   * blank screen would read as broken, the page passes a real empty state.
   */
  emptyState?: React.ReactNode;
}) {
  const [cases, setCases] = useState<live.Trial[] | null>(null);
  const [statements, setStatements] = useState<Record<string, live.TrialStatement[]>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [openCase, setOpenCase] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const rows = await live.listTrials();
      setCases(rows);
      // Names for the statement authors. A leader sees the church list anyway;
      // a party to a case sees only the handful of people in it, and anybody
      // this does not cover reads as "Someone" rather than as a raw id.
      try {
        const people = await live.listMembers();
        setNames(Object.fromEntries(people.map((p) => [p.id, p.full_name || 'Someone'])));
      } catch {
        setNames({});
      }
    } catch (cause) {
      setCases([]);
      setError(humanError(cause, 'Could not load the cases.'));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // Several people speak into one hearing, so a stale view is worst here.
  useKeepUp(KEEP_UP_CASES, load);

  const openThread = async (id: string) => {
    setOpenCase(openCase === id ? '' : id);
    if (openCase === id || statements[id]) return;
    try {
      const said = await live.listStatements(id);
      setStatements((s) => ({ ...s, [id]: said }));
    } catch (cause) {
      setError(humanError(cause, 'Could not load what was said.'));
    }
  };

  const speak = async (id: string) => {
    const body = (draft[id] ?? '').trim();
    if (!body) return;
    setBusy(id); setError('');
    try {
      await live.speakInTrial(id, body);
      setDraft((d) => ({ ...d, [id]: '' }));
      const said = await live.listStatements(id);
      setStatements((s) => ({ ...s, [id]: said }));
    } catch (cause) {
      setError(humanError(cause, 'That did not send.'));
    } finally { setBusy(''); }
  };

  // Every one of these returns a sentence when it refuses. Show the sentence.
  const run = async (id: string, fn: () => Promise<string>, ok: string) => {
    setBusy(id); setError(''); setNotice('');
    try {
      const verdict = await fn();
      if (verdict !== 'ok') { setError(verdict); return; }
      setNotice(ok);
      await load();
    } catch (cause) {
      setError(humanError(cause, 'That did not work.'));
    } finally { setBusy(''); }
  };

  const open = (cases ?? []).filter((c) => c.status === 'open');
  const closed = (cases ?? []).filter((c) => c.status === 'closed');
  const leads = me.role === 'admin' || me.role === 'executive';

  const verdictWord = (v: string | null) =>
    v === 'dismissed' ? 'Dismissed'
    : v === 'suspended' ? 'Suspended'
    : v === 'removed' ? 'Removed from the church'
    : '';

  const caseCard = (c: live.Trial) => (
    <li key={c.id} className="rounded-xl bg-gray-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block font-semibold text-navy">
            {c.subject_name}
            {c.my_part === 'accused' && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                This case is about you
              </span>
            )}
          </span>
          <span className="block text-sm text-gray-600">{c.summary}</span>
          <span className="mt-1 block text-xs text-gray-500">
            Opened by {c.opener_name} · Head judge: {c.judge_name}
            {c.am_judge && ' (you)'}
            {/* Leadership only: who the senior seat belongs to is not named to members. */}
            {leads && c.escalation === 'requested' && ' · waiting for an Executive Director'}
          </span>
          {c.status === 'closed' && (
            <span className="mt-1 block text-sm font-semibold text-navy">
              {verdictWord(c.verdict)}
              {c.verdict_note ? ` · ${c.verdict_note}` : ''}
            </span>
          )}
        </span>
        <Button variant="ghost" onClick={() => void openThread(c.id)}>
          {openCase === c.id ? 'Close' : 'Open the case'}
        </Button>
      </div>

      {openCase === c.id && (
        <div className="mt-3 border-t border-black/5 pt-3">
          <h4 className="text-sm font-bold uppercase tracking-wide text-gray-500">
            What has been said
          </h4>
          {(statements[c.id] ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Nobody has spoken yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {(statements[c.id] ?? []).map((st) => (
                <li key={st.id} className="rounded-xl bg-white p-3 ring-1 ring-gray-200">
                  <p className="text-sm font-semibold text-navy">
                    {st.author_id === me.id ? 'You' : names[st.author_id] ?? 'Someone'}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{st.body}</p>
                </li>
              ))}
            </ul>
          )}

          {c.status === 'open' && (
            <div className="mt-3">
              <label className="block">
                <span className="text-sm font-semibold text-navy">Say your piece</span>
                <textarea
                  value={draft[c.id] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                  rows={3}
                  placeholder="Tell the court what happened, in your own words."
                  className="mt-1 w-full rounded-xl bg-white p-3 text-base outline-none ring-1 ring-gray-300 focus:ring-2 focus:ring-gold"
                />
              </label>
              <div className="mt-2">
                <Button variant="gold" disabled={busy === c.id || !(draft[c.id] ?? '').trim()}
                        onClick={() => void speak(c.id)}>
                  Add to the record
                </Button>
              </div>
            </div>
          )}

          {c.status === 'open' && c.am_judge && (
            <div className="mt-4 border-t border-black/5 pt-3">
              <h4 className="text-sm font-bold uppercase tracking-wide text-gray-500">
                You are the head judge
              </h4>

              {me.role === 'admin' && c.escalation !== 'accepted' && (
                <div className="mt-2">
                  <Button variant="ghost" disabled={busy === c.id || c.escalation === 'requested'}
                          onClick={() => void run(c.id, () => live.callHeadJudge(c.id),
                            'An Executive Director has been asked to judge this case. You stay the judge until one takes it.')}>
                    {c.escalation === 'requested'
                      ? 'An Executive Director has been asked'
                      : 'Ask an Executive Director to judge this'}
                  </Button>
                  <p className="mt-1 text-xs text-gray-500">
                    You keep the seat until one answers. If none does, you decide the case.
                  </p>
                </div>
              )}

              <label className="mt-3 block">
                <span className="text-sm font-semibold text-navy">
                  Your reason <span className="font-normal text-gray-500">(kept with the decision)</span>
                </span>
                <input
                  value={note[c.id] ?? ''}
                  onChange={(e) => setNote((n) => ({ ...n, [c.id]: e.target.value }))}
                  placeholder="Both sides were heard on 20 August."
                  className="tap mt-1 w-full rounded-xl bg-white px-3 text-base outline-none ring-1 ring-gray-300 focus:ring-2 focus:ring-gold"
                />
              </label>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="ghost" disabled={busy === c.id}
                        onClick={() => void run(c.id, () => live.closeTrial(c.id, 'dismissed', note[c.id]),
                          'The case was dismissed. Nothing happens to them.')}>
                  Dismiss
                </Button>
                <Button variant="gold" disabled={busy === c.id}
                        onClick={() => void run(c.id, () => live.closeTrial(c.id, 'suspended', note[c.id]),
                          'They are suspended. Their account is switched off until a Director lifts it.')}>
                  Suspend them
                </Button>
                <Button variant="danger" disabled={busy === c.id}
                        onClick={() => setOpenCase(`rm-${c.id}`)}>
                  Remove instead
                </Button>
              </div>
            </div>
          )}

          {c.status === 'open' && !c.am_judge && me.role === 'executive'
            && c.escalation === 'requested' && (
            <div className="mt-4 rounded-xl bg-blue-50 p-3 ring-1 ring-blue-200">
              <p className="text-sm text-blue-900">
                A Director has asked for an Executive Director to judge this case.
              </p>
              <div className="mt-2">
                <Button variant="gold" disabled={busy === c.id}
                        onClick={() => void run(c.id, () => live.takeHeadJudge(c.id),
                          'You are now the head judge of this case.')}>
                  Take the seat
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {openCase === `rm-${c.id}` && (
        <div className="mt-3 rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
          <p className="text-sm font-semibold text-red-900">
            Remove {c.subject_name} from the church? This cannot be undone.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="danger" disabled={busy === c.id}
                    onClick={() => void run(c.id, () => live.closeTrial(c.id, 'removed', note[c.id]),
                      `${c.subject_name} has been removed from the church.`)}>
              Yes, remove them
            </Button>
            <Button variant="ghost" onClick={() => setOpenCase(c.id)}>Go back</Button>
          </div>
        </div>
      )}
    </li>
  );

  // Somebody with no cases at all should not be shown an empty courtroom,
  // unless the screen they are on has nothing else to say.
  if (cases && cases.length === 0 && !leads) return <>{emptyState ?? null}</>;

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">⚖️ Cases</h2>
      <p className="mt-1 text-sm text-gray-500">
        {leads
          ? 'Open a case from the trial room below, hear both sides here, then decide it.'
          : 'A case you have been called to. Say what happened in your own words. The head judge reads everything here before deciding.'}
      </p>

      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>}
      {notice && <p className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-800 ring-1 ring-green-300">{notice}</p>}

      {!cases ? (
        <BeaconSpinner inline label="Loading" className="mt-3" />
      ) : (
        <>
          <div className="mt-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">
              Open · {open.length}
            </h3>
            {open.length === 0 ? (
              <p className="mt-2 text-gray-500">No open cases.</p>
            ) : (
              <ul className="mt-2 space-y-2">{open.map(caseCard)}</ul>
            )}
          </div>

          {closed.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">
                Decided · {closed.length}
              </h3>
              <ul className="mt-2 space-y-2">{closed.map(caseCard)}</ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

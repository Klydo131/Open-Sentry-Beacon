'use client';

// Suspend or remove: what a Director does when something has to stop.
//
// Until 27 October 2026 this was "the trial room", beside a court room that
// heard a case first. The court room closed that day ("no more trial online");
// the conversation about a report is Admin Reports
// (components/LiveAdminReports.tsx), and this is what is left, unchanged: the
// two acts that change somebody's account.
//
// TWO ACTS, KEPT SEPARATE ON PURPOSE:
//
//   SUSPEND           The account is switched OFF (0026). They stay in the
//                     church and keep their history, and cannot sign in at all;
//                     live sessions are dropped so somebody already signed in
//                     is out at once. Reversible: lifting it switches it back
//                     on. This is both "we are looking into it" and "you are
//                     out until you have spoken to us", and most real
//                     situations are one of those, not expulsion.
//   REMOVE            They are gone.
//
// Offering only removal would push a Director towards the harshest option
// because it is the only one; offering only suspension would leave them unable
// to end something that has to end.
//
// WHO MAY DO WHAT IS NOT DECIDED HERE. Every button calls a definer function
// that checks the caller's role against the target's (migration 0023). This
// screen asks the same question first, only so a Director is not shown a
// button that would refuse: an Executive Director may act on anyone in a
// church they oversee (0025); a Director on Guides and Explorers alone; nobody
// on themselves; and nobody at all on the Head Executive Director, who is the
// root of authority and the only account that can appoint executives again.

import { useCallback, useEffect, useState } from 'react';
import { useKeepUp, KEEP_UP_DISCIPLINE } from '@/lib/live/keep-up';
import type { Profile } from '@/lib/types';
import * as live from '@/lib/live/data';
import { roleNoun } from '@/lib/brand';
import { Button, Card } from '@/components/ui';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { humanError } from '@/lib/live/errors';

export function LiveSuspendOrRemove({ me }: { me: Profile }) {
  const [members, setMembers] = useState<Profile[] | null>(null);
  const [allowed, setAllowed] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openFor, setOpenFor] = useState('');

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
  // Another Director suspending or lifting somebody shows here at once.
  useKeepUp(KEEP_UP_DISCIPLINE, load);

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
      <h2 className="text-xl font-bold text-navy">Suspend or remove</h2>
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
                    {openFor === m.id ? 'Cancel' : 'Suspend or remove'}
                  </Button>
                </div>

                {openFor === m.id && (
                  <div className="mt-3 border-t border-black/5 pt-3">
                    <label className="block">
                      <span className="text-sm font-semibold text-navy">
                        Why? <span className="font-normal text-gray-500">(kept with the suspension)</span>
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
                      <Button variant="ghost" disabled={busy === m.id}
                              onClick={() => void act(m.id, 'suspend', m.full_name)}>
                        Suspend now
                      </Button>
                      {/* Removal is deliberately the second press, and never the
                          default. It cannot be undone, and a Director reaching
                          for it in anger is the case this guard exists for. */}
                      <Button variant="danger" disabled={busy === m.id}
                              onClick={() => setOpenFor(`rm-${m.id}`)}>
                        Remove from the church
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

'use client';

// Leave to answer: the court room for a suspended member whom the judge has
// let in to answer one case, and nothing else.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 20 October 2026: "Suspended person can be summoned if an ED or
// Director allowed them ... suspended accounts will have temporary lift of
// using the account on a permission to use to be summoned on the digital
// court."
//
// WHAT THE ACCOUNT CAN REACH is the database's decision
// (20261020180000_leave_to_answer_and_a_record_that_outlives_the_account):
// the court room's own calls, for the one case, while the leave lasts. Every
// other table refuses it, its own profile included, and so does the live
// connection. So this page:
//   * asks only the court room's door who is asking and which case it is;
//   * never reads the profile and never opens the app's shell, which would
//     only collect refusals;
//   * reads the case again every half minute instead of listening for changes;
//   * looks at the door every minute, and says plainly when the leave has
//     ended, rather than leaving the person in front of a screen that has
//     stopped answering.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { CourtDoorPanel } from '@/components/court/CourtDoorPanel';
import { Hearing } from '@/components/court/Hearing';
import { Seal } from '@/components/court/CourtFurniture';
import { courtDoor, isAccountSuspended, type CourtDoor } from '@/lib/live/court';
import { minutesLeft } from '@/lib/live/court-door';
import { humanError } from '@/lib/live/errors';
import { readBrowserSession } from '@/lib/supabase/client';
import * as live from '@/lib/live/data';
import type { Profile, Role } from '@/lib/types';
import '@/components/court/court.css';

type State = 'looking' | 'signed_out' | 'not_on_leave' | 'ended' | 'unreachable' | 'answering';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function AnswerRoom() {
  const [state, setState] = useState<State>('looking');
  const [door, setDoor] = useState<CourtDoor | null>(null);
  const [error, setError] = useState('');

  const look = useCallback(async () => {
    if (!readBrowserSession()) { setState('signed_out'); return; }
    try {
      const found = await courtDoor();
      setDoor(found);
      setError('');
      if (found.leave) setState('answering');
      else setState(found.suspended ? 'ended' : 'not_on_leave');
    } catch (cause) {
      // The leave ran out or was ended: the database now refuses the account
      // outright, the door included.
      if (isAccountSuspended(cause)) { setState('ended'); return; }
      setError(humanError(cause, 'The court room could not be reached. Check your connection and try again.'));
      setState((s) => (s === 'answering' ? s : 'unreachable'));
    }
  }, []);

  useEffect(() => { void look(); }, [look]);

  // The leave can end at any moment: by the judge, by its time, at the end of the hearing.
  useEffect(() => {
    if (state !== 'answering') return;
    const timer = window.setInterval(() => { void look(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [state, look]);

  const signOut = async () => {
    await live.signOut().catch(() => undefined);
    window.location.replace('/login');
  };

  if (state === 'looking') return <BeaconSpinner inline label="Opening the court room" />;

  if (state === 'signed_out') {
    return (
      <Notice title="Sign in to answer">
        <p>If a church leader has let you answer a case, sign in with your e-mail and password. You will come back here.</p>
        <Link href="/login" className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-gold px-5 font-bold text-navy">
          Sign in
        </Link>
      </Notice>
    );
  }

  if (state === 'not_on_leave') {
    return (
      <Notice title="Nothing to answer here">
        <p>This page is for somebody answering a case while their account is suspended. Your cases are in Settings, under Admin Reports.</p>
        <Link href="/cases" className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-gold px-5 font-bold text-navy">
          Open Admin Reports
        </Link>
      </Notice>
    );
  }

  if (state === 'ended') {
    return (
      <Notice title="Your leave to answer has ended" data-answer-ended>
        <p>
          Your account stays suspended until a Director lifts it, so the court room is closed to you again. What you
          said and entered is on the case&rsquo;s record.
        </p>
        <p>
          If you have more to say, tell the church leader who called you. They can write it down for you, or let you
          answer again.
        </p>
        <div className="mt-3">
          <Button variant="gold" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </Notice>
    );
  }

  if (state === 'unreachable' || !door?.leave || !door.me) {
    return (
      <Notice title="The court room could not be reached">
        <p>{error || 'Check your connection and try again.'}</p>
        <div className="mt-3">
          <Button variant="gold" onClick={() => void look()}>Try again</Button>
        </div>
      </Notice>
    );
  }

  if (!door.open) return <CourtDoorPanel door={door} onOpened={look} />;

  // Who is answering, as the door told it; the profile itself stays closed.
  const me = { id: door.me.id, full_name: door.me.name, role: door.me.role as Role } as Profile;

  return (
    <div className="ct-room space-y-3" data-answer-room>
      {/* The same short header as the court room's: what this is, until when,
          and the way out. The rest of the app stays closed while the account
          is suspended, and everything here is on the record. */}
      <header className="ct-top">
        <Seal className="ct-seal" />
        <div className="ct-top-words">
          <h2 className="ct-top-title">Leave to answer</h2>
          <p className="ct-top-door">
            <span className="ct-door-dot" aria-hidden />
            You may answer this case until {when(door.leave.until)}. Only the court room is open to you, and
            everything here is on the record. The door stays open {minutesLeft(door.until)} more minutes.
          </p>
        </div>
        <Button variant="ghost" onClick={() => void signOut()}>Sign out</Button>
      </header>
      {error && <p className="ct-finding ct-finding-bad" role="alert">{error}</p>}
      <Hearing
        id={door.leave.case}
        me={me}
        advanced={false}
        poll
        onLocked={() => void look()}
        onChanged={() => undefined}
      />
    </div>
  );
}

function Notice({ title, children, ...rest }: { title: string; children: React.ReactNode } & Record<`data-${string}`, boolean>) {
  return (
    <div className="ct-room" {...rest}>
      <div className="ct-door">
        <Seal className="ct-seal" />
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

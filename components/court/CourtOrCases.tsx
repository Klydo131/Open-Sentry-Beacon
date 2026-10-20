'use client';

// Where the screens that used to hold a case now point.
//
// The Admin room's Safeguarding folder and a member's Settings, Admin Reports
// folder each drew the cases inline. Once a church's database has the court
// room (20261020160000_the_court_room), a case is read only through its door,
// so these screens point at the room instead of opening a second, doorless
// way in. Before the update they draw what they always drew.

import Link from 'next/link';
import { Card } from '@/components/ui';
import { LiveCourt } from '@/components/LiveTrialRoom';
import { LiveHallOfJustice } from '@/components/LiveHallOfJustice';
import { Seal } from '@/components/court/CourtFurniture';
import { useCourtEdition } from '@/lib/live/court';
import type { Profile } from '@/lib/types';

export function CourtOrCases({ me, hall = false, emptyState }: {
  me: Profile;
  /** Leadership's screens also showed the Hall of Justice. */
  hall?: boolean;
  emptyState?: React.ReactNode;
}) {
  const edition = useCourtEdition();
  if (edition === null) return null;
  if (edition === 'cases') {
    return (
      <>
        {hall && <LiveHallOfJustice me={me} />}
        <LiveCourt me={me} emptyState={emptyState} />
      </>
    );
  }
  const leads = me.role === 'admin' || me.role === 'executive';
  return (
    <div data-court-pointer>
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <Seal className="h-12 w-12 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-navy">The court room</h2>
            <p className="mt-1 text-sm text-gray-600">
              {leads
                ? 'Cases are heard in the court room: open one, watch a hearing, examine exhibits and decide. Its door asks for your code from your authenticator app.'
                : 'Any case you are called to is in the court room. Its door asks for your password again, so a case stays private if somebody else picks up your phone.'}
            </p>
            <Link
              href="/cases"
              className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-gold px-5 font-bold text-navy"
            >
              Go to the court room
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}

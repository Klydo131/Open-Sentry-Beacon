'use client';

// Cases, in a room of their own.
//
// WHY IT IS NOT A CARD ON A DASHBOARD ANY MORE. A case is a formal proceeding
// about a person, sometimes about the person reading it, and it sat as one more
// panel among a Guide's Explorers and an Explorer's lessons. Two things go
// wrong with that. It is easy to scroll past on the one day it matters, and it
// puts a hearing in the same visual rank as a study plan.
//
// A room also means it can be linked to. "Open the case" in a notification, a
// Director saying "look at the Cases screen", a person coming back tomorrow to
// add something: all of those need an address, and a card halfway down another
// page does not have one.
//
// EVERY ROLE HAS IT, including an Explorer, and that is the point. An Explorer
// called into a case is the person in it with the least standing, and their
// answer must be reachable without anybody having to tell them where to look.
// They can post here even while suspended: suspending somebody pending a
// hearing must not take away their side of it.

import { AppShell } from '@/components/AppShell';
import { LiveAppShell } from '@/components/LiveAppShell';
import { LiveCourt } from '@/components/LiveTrialRoom';
import { useLiveSession } from '@/lib/live/session';
import { useIsLive } from '@/lib/tutorial';
import { Card } from '@/components/ui';
import type { Role } from '@/lib/types';

// STILL EVERY ROLE, EVEN THOUGH ONLY LEADERSHIP HAS A DOOR TO IT.
// The navigation entry is leadership's; the ROUTE is not. A Guide or an
// Explorer reaches this through Settings -> Admin Reports, and a notification
// about a case links straight here. Narrowing this list to leadership would
// turn both into a refusal for the person the case is actually about.
const ALL: Role[] = ['executive', 'admin', 'dm', 'ds'];

function Heading() {
  return (
    <div>
      <h1 className="text-3xl font-extrabold text-room">⚖️ Admin Reports</h1>
      {/* SAID ON THE PAGE AS WELL AS IN THE RAIL. The chip beside the room's
          name is a reminder for somebody choosing where to go; this is for
          somebody already here, deciding whether to rely on what they find.
          Both were asked for, and the rail alone is easy to walk past. */}
      <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
        Still on beta. This room is being built, so expect it to change and do
        not rely on it for anything you cannot repeat elsewhere.
      </p>

      <p className="mt-1 text-room-soft">
        Any case you have been called to. Say what happened in your own words.
      </p>
    </div>
  );
}

/**
 * The empty state is a real one, not a blank screen.
 *
 * A room that is empty most of the time has to say it is empty on purpose,
 * or somebody who opens it on a quiet day concludes it is broken and stops
 * checking it on the day it is not.
 */
function Nothing() {
  return (
    <Card className="p-6 text-center">
      <p className="text-lg font-bold text-navy">Nothing open</p>
      <p className="mt-1 text-sm text-gray-500">
        You have not been called to any case. If you are, it appears here and
        you will be told.
      </p>
    </Card>
  );
}

function Live() {
  const { profile } = useLiveSession();
  if (!profile) return null;
  return (
    <div className="space-y-5">
      <Heading />
      {/* LiveCourt draws nothing when there are no cases, which is right on a
          dashboard and wrong here: this room would be a blank page. It takes an
          empty state for exactly this screen. */}
      <LiveCourt me={profile} emptyState={<Nothing />} />
    </div>
  );
}

/**
 * The tutorial has no courtroom of its own.
 *
 * Cases are a real safeguarding proceeding about a real person, and the demo's
 * sample people have none. Rather than invent a fake hearing about an invented
 * member, this says plainly what the room is for. Saying "there is nothing to
 * practise on" beats teaching somebody to expect a case that will not be there.
 */
function Demo() {
  return (
    <div className="space-y-5">
      <Heading />
      <Card className="p-6 text-center">
        <p className="text-lg font-bold text-navy">Nothing to show in the tutorial</p>
        <p className="mt-1 text-sm text-gray-500">
          A case is a real proceeding about a real person, so there is none
          among the sample people. On the live app, any case you are called to
          appears in this room.
        </p>
      </Card>
    </div>
  );
}

export default function CasesPage() {
  if (useIsLive()) {
    return <LiveAppShell allow={ALL}><Live /></LiveAppShell>;
  }
  return <AppShell allow={ALL}><Demo /></AppShell>;
}

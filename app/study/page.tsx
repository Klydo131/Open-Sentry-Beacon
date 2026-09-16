'use client';

// The Study Room: a room in My Rooms, not a card at the bottom of a tab.
//
// ---------------------------------------------------------------------------
// ASKED FOR, AND GOT WRONG THE FIRST TIME. "I want Affine to be the special
// room for the Explorer", and then, after it arrived as a card under the Study
// tab: "I told you to make it a separate room in My Rooms application right?
// For us to see the whole feature of Affine!"
//
// In this app a ROOM is a specific thing: an entry in the left rail beside
// Home, My Journey and My Files, with a page of its own. A card inside another
// room's tab is not that, and it also gave a full editor about a third of a
// screen to live in, which is the opposite of what an editor needs.
//
// So: its own route, its own rail entry, and the editor gets the page. It opens
// on arrival rather than behind a button, because walking into the Study Room
// IS asking for it -- the button exists so nobody downloads three megabytes
// while reading something else, and that reason does not apply here.
//
// BOTH HALVES OF THE APP, like every other room. The live one keeps pages in
// the church's own database; the walkthrough keeps them nowhere and says so.
// ---------------------------------------------------------------------------

import { AppShell } from '@/components/AppShell';
import { LiveAppShell } from '@/components/LiveAppShell';
import { StudyRoom } from '@/components/study/StudyRoom';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { useIsLive } from '@/lib/tutorial';
import { useLiveSession } from '@/lib/live/session';
import { useDemo } from '@/lib/demo/store';

function LiveStudyRoom() {
  const { profile } = useLiveSession();
  return (
    <LiveAppShell allow={['ds']}>
      {profile
        ? <StudyRoom me={profile} fullPage />
        : <BeaconSpinner inline label="Opening your study room" />}
    </LiveAppShell>
  );
}

function DemoStudyRoom() {
  const { currentUser } = useDemo();
  return (
    <AppShell allow={['ds']}>
      {currentUser
        ? <StudyRoom me={currentUser} demo fullPage />
        : <BeaconSpinner inline label="Opening your study room" />}
    </AppShell>
  );
}

export default function StudyRoomPage() {
  if (useIsLive()) return <LiveStudyRoom />;
  return <DemoStudyRoom />;
}

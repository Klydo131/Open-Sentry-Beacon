'use client';

// The Explorer's study room, and the gate that keeps it from costing everybody.
//
// ---------------------------------------------------------------------------
// ASKED FOR: AFFiNE as the Explorer's special room, "a special room like the
// library page... the whole Affine features like this but with Hope Beacon
// brand", and then, plainly: "If I click the study room I want to see this with
// the brand of Hope beacon, if I want to exit the study room, then I will go
// back to Hope Beacon web page, simple as that."
//
// THE ONE RULE OF THIS FILE. The editor is the heaviest thing in the app --
// around 800 kB gzipped against roughly 540 kB for everything else put
// together. It is loaded here with next/dynamic and ssr:false, which is what
// puts it in its own chunk and keeps it out of the shared bundle. A plain
// import instead of this one would put it on the sign-in screen.
//
// THERE IS NO LONGER A BUTTON, and that is the point rather than a loosening.
// The room used to be a card inside another screen with an "Open my study room"
// button, because three megabytes should not land on somebody reading their
// journey. It now has a route of its own and nothing else renders it, so
// walking into /study IS the asking -- and tests/the-study-room-is-paid-for-on-
// arrival.mjs holds that: one importer, arriving dynamically, rendered from one
// route.
//
// EXPLORERS ONLY. Not a permission -- the database decides that -- but a matter
// of not showing a Guide a door into a room built around somebody else's
// reading. Their own study notes live in their own room.
// ---------------------------------------------------------------------------

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

import { SupabaseDocSource } from '@/lib/study/doc-source';
import { SupabaseBlobSource } from '@/lib/study/blob-source';
import { MemoryDocSource } from '@/lib/study/memory-source';
import { db } from '@/lib/live/data';
import { BeaconSpinner } from '@/components/BeaconLoader';
import type { Profile } from '@/lib/types';

const StudyRoomEditor = dynamic(
  () => import('@/components/study/StudyRoomEditor').then((m) => m.StudyRoomEditor),
  {
    ssr: false,
    // FULL SCREEN WHILE IT ARRIVES, because the room it is loading is full
    // screen. A spinner in a card, replaced a second later by something that
    // covers the window, is two different screens in a row for no reason.
    loading: () => (
      <div className="fixed inset-0 z-50 grid place-items-center bg-[#FAF7F2]">
        <BeaconSpinner inline label="Opening your study room" />
      </div>
    ),
  },
);

export function StudyRoom({ me, demo = false }: {
  me: Profile;
  demo?: boolean;
}) {
  const router = useRouter();

  // A FACTORY, AND STABLE. Stable because a new function each render remounts
  // the editor and throws away whatever somebody was typing. A factory because
  // the live source needs a database client and asking for one during render
  // throws when the app is not connected -- which does not show an error, it
  // shows an empty room.
  const makeSource = useMemo(
    () => () => (demo ? new MemoryDocSource() : new SupabaseDocSource(db(), me.id, 'study-room')),
    [demo, me.id],
  );

  // AND SOMEWHERE FOR THE PICTURES. The walkthrough keeps them in the tab,
  // which is honest there -- nothing in the walkthrough is saved anywhere. In
  // the live room they are rows in the church's own database, so a photograph
  // of a Bible page is still there tomorrow.
  const makeBlobs = useMemo(
    () => (demo ? undefined : () => new SupabaseBlobSource(db(), me.id, 'study-room')),
    [demo, me.id],
  );

  if (me.role !== 'ds') return null;

  return (
    <StudyRoomEditor
      makeSource={makeSource}
      makeBlobs={makeBlobs}
      demo={demo}
      // OUT OF THE ROOM AND BACK INTO THE APP. Their own journey, which is
      // where they came from and the one screen every Explorer has.
      onExit={() => router.push('/ds')}
    />
  );
}

export default StudyRoom;

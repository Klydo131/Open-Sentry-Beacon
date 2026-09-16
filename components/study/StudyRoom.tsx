'use client';

// The Explorer's study room, and the gate that keeps it from costing everybody.
//
// ---------------------------------------------------------------------------
// ASKED FOR: AFFiNE as the Explorer's special room, "more like a real study
// room for them to use".
//
// THE ONE RULE OF THIS FILE. The editor is 3.25 MB gzipped, measured, against
// an application that is 0.54 MB gzipped in total. It is loaded here with
// next/dynamic and ssr:false, which is what puts it in its own chunk and keeps
// it out of the shared bundle. A plain import instead of this one would put
// three megabytes on the sign-in screen.
//
// AND IT IS NOT DOWNLOADED UNTIL SOMEBODY OPENS THE ROOM. `open` gates the
// dynamic component, not merely its visibility: an Explorer who never taps
// Open never pays for it, and on mobile data that is the difference between a
// room and a reason to stop using the app.
//
// EXPLORERS ONLY. Not a permission -- the database decides that -- but a matter
// of not showing a Guide a door into a room built around somebody else's
// reading. Their own study notes live in their own room.
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { SupabaseDocSource } from '@/lib/study/doc-source';
import { MemoryDocSource } from '@/lib/study/memory-source';
import { db } from '@/lib/live/data';
import { Button, Card } from '@/components/ui';
import { BeaconSpinner } from '@/components/BeaconLoader';
import type { Profile } from '@/lib/types';

const StudyRoomEditor = dynamic(
  () => import('@/components/study/StudyRoomEditor').then((m) => m.StudyRoomEditor),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-[40vh] place-items-center [min-height:40dvh]">
        <BeaconSpinner inline label="Bringing in your desk" />
      </div>
    ),
  },
);

export function StudyRoom({ me, demo = false, fullPage = false }: {
  me: Profile;
  demo?: boolean;
  /** On its own page the editor gets the screen, and opens without being asked. */
  fullPage?: boolean;
}) {
  // ON ITS OWN PAGE, OPENING IT IS THE POINT OF ARRIVING. The button exists so
  // nobody downloads three megabytes while reading something else; somebody who
  // has walked into the Study Room has already asked.
  const [open, setOpen] = useState(fullPage);

  // A FACTORY, AND STABLE. Stable because a new function each render remounts
  // the editor and throws away whatever somebody was typing. A factory because
  // the live source needs a database client and asking for one during render
  // throws when the app is not connected -- which does not show an error, it
  // shows an empty room.
  const makeSource = useMemo(
    () => () => (demo ? new MemoryDocSource() : new SupabaseDocSource(db(), me.id, 'study-room')),
    [demo, me.id],
  );

  if (me.role !== 'ds') return null;

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">📖 Study room</h2>
      <p className="mt-1 text-sm text-gray-500">
        Somewhere of your own to write while you read. What you write here stays
        yours: your Guide can see that you have been working, never what you
        wrote.
      </p>
      {/* THE ROOM CAN DO A GREAT DEAL AND SAID NONE OF IT. Headings, quotes,
          three kinds of list, tables and callouts were all there and all
          invisible, because the only way to reach them is a key nobody had been
          told about. "that's it? that's what all the study room can do? write
          notes?" A feature nobody can find is not a feature. */}
      <p className="mt-2 text-sm text-gray-500">
        Type <span className="rounded bg-gray-100 px-1 font-mono">/</span> on a line
        for headings, lists, to&#8209;do boxes, quotes, tables and dividers. Select
        words to make them bold or add a link.
      </p>

      {demo && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          This is the walkthrough, so nothing you type here is saved anywhere.
          In the real app it is kept in your church&rsquo;s own database.
        </p>
      )}

      {open ? (
        <div className="mt-4">
          <StudyRoomEditor makeSource={makeSource} />
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-gray-50 p-6 text-center">
          <p className="text-sm text-gray-600">
            The desk takes a moment to arrive the first time, so it waits until
            you ask for it.
          </p>
          <Button variant="gold" className="mt-3" onClick={() => setOpen(true)}>
            Open my study room
          </Button>
        </div>
      )}
    </Card>
  );
}

'use client';

// The office: where the work is done, as opposed to where the people are.
//
// WHY THIS ROOM EXISTS. The tools were scattered through the screens that are
// about people. A Guide's roster carried study-writing, library-stocking and a
// blog desk under the list of the five people they walk with; a Director's
// analytics and export lived inside one tab of the admin screen, three clicks
// from anywhere. So the screens about people were long, and the tools were hard
// to find, and both problems have the same fix.
//
// The split is by KIND OF WORK, not by permission:
//
//   * a roster, a conversation, a case  -> about a person, on their own screen
//   * numbers, exports, stocking a shelf -> office work, in here
//   * a blog post, an announcement -> publishing, in /publish
//
// Writing left this room after it arrived here: a blog post and a notice are
// the same act for every role, including an Explorer, and this room is only for
// people who have work to do. Publishing has a room of its own.
//
// Explorers do not have this room. Not because anything is hidden from them,
// but because none of it is theirs to do: an Explorer has no roster to report
// on, no shelf to stock and nobody to write studies for. A room that would be
// empty for them is a room that tells them they are missing something.
//
// NOTHING NEW IS BUILT HERE. Every panel already existed and already carries
// its own permissions, in the database rather than in this file. Moving a card
// cannot grant anybody anything, which is the point of putting the rules where
// they are.
//
// SUBROOMS, BECAUSE A ROOM IS NOT A SCROLL.
//
// Reported by the owner, with a drawing: a room is a folder and a subroom is a
// folder inside it. "I want the user to just click or tap the subrooms so they
// can just go to their destination and not scroll down tirelessly. If I pick
// the Lesson studies subroom, I will automatically go there and create my own
// Lesson studies, not scroll down and find it."
//
// He was right, and this room was the worst offender in the app. It held nine
// panels stacked down one page. A Guide who came here to write a study passed
// their numbers, the shelf, two pairing cards and a recommendation form on the
// way, every single time, and on a phone that is most of a minute of thumb.
//
// The mechanism is the one the Director's screen has used since it was split
// into rooms: `useRoom` remembers where you were, `?room=` in the address wins
// over the memory so a link can still send you somewhere exact, and the strip
// scrolls sideways inside itself on a narrow phone. Nothing here is new
// invention; the Office simply never got it.
//
// ONE PANEL LIVES IN EXACTLY ONE SUBROOM. A panel that appears in two is a
// panel somebody will look for in the third.

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { LiveAppShell } from '@/components/LiveAppShell';
import { useLiveSession } from '@/lib/live/session';
import { useIsLive } from '@/lib/tutorial';
import * as live from '@/lib/live/data';
import { useKeepUp, KEEP_UP_PEOPLE } from '@/lib/live/keep-up';
import { Card } from '@/components/ui';
import { RoomTabs, useRoom, type Room } from '@/components/Rooms';
import { LiveAnalytics } from '@/components/LiveAnalytics';
import { LiveExport } from '@/components/LiveExport';
import { LiveBoardReport } from '@/components/LiveExecutive';
import { LiveStudies } from '@/components/LiveStudies';
import { LiveLibraryForGuide } from '@/components/LiveLibrary';
import { LiveRecommend } from '@/components/LiveMinistry';
import {
  LiveAskToWalkWith, LivePairingRequestsForDirector, LiveGuildRoom,
} from '@/components/LiveGuildRoom';
import { Analytics } from '@/components/DemoAnalytics';
import { LessonSeriesLibrary } from '@/components/LessonSeriesLibrary';
import type { Role } from '@/lib/types';

// Guides and leadership. Explorers are sent home by the shell.
const WORKERS: Role[] = ['executive', 'admin', 'dm'];

function Heading({ subtitle }: { subtitle: string }) {
  return (
    <div>
      <h1 className="text-3xl font-extrabold text-room">🗂️ Office</h1>
      <p className="mt-1 text-room-soft">{subtitle}</p>
    </div>
  );
}

function LiveOffice() {
  const { profile } = useLiveSession();
  const [churchName, setChurchName] = useState<string>();
  const [pairings, setPairings] = useState<{ id: string; ds_name: string }[]>([]);
  const [waitingAsks, setWaitingAsks] = useState(0);

  // A request that arrives while this tab is open has to move the badge below.
  // Without this the count is only ever as fresh as the last full page load,
  // which is the refresh-your-browser complaint the keep-up hook exists to end.
  const [tick, setTick] = useState(0);
  useKeepUp(KEEP_UP_PEOPLE, useCallback(() => setTick((t) => t + 1), []));

  useEffect(() => {
    live.myChurch().then((c) => setChurchName(c?.name ?? undefined)).catch(() => {});
  }, []);

  const isGuide = profile?.role === 'dm';
  useEffect(() => {
    if (!isGuide) return;
    let alive = true;
    live.listPairings()
      .then((rows) => {
        if (!alive) return;
        setPairings(rows.filter((r) => r.status === 'active')
          .map((r) => ({ id: r.id, ds_name: r.ds_name })));
      })
      // The shelf still works without the share buttons, so a failed lookup
      // must not take the whole room down.
      .catch(() => {});
    return () => { alive = false; };
  }, [isGuide, tick]);

  // THE BADGE IS THE REASON THE TAB IS WORTH READING. Without a count, a
  // Director has to open Pairing requests to find out whether anybody is
  // waiting, which is the scrolling problem again with an extra tap on top.
  const leads = profile?.role === 'admin' || profile?.role === 'executive';
  useEffect(() => {
    if (!leads) return;
    let alive = true;
    live.listPairingRequests()
      .then((rows) => {
        if (alive) setWaitingAsks(rows.filter((r) => r.status === 'pending').length);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [leads, tick]);

  // The subrooms, in the order each role actually needs them. A Guide opens
  // this room to write; leadership opens it to read the numbers.
  const rooms: Room[] = profile?.role === 'dm'
    ? [
      { id: 'studies', label: '📖 Lesson studies' },
      { id: 'library', label: '📚 Resources' },
      { id: 'guild', label: '💬 Guides\u2019 room' },
      { id: 'people', label: '🤝 Put a name forward' },
      { id: 'numbers', label: '📈 Numbers' },
    ]
    : [
      { id: 'numbers', label: '📈 Numbers' },
      { id: 'reports', label: '🖨️ Reports' },
      { id: 'studies', label: '📖 Lesson studies' },
      { id: 'library', label: '📚 Library' },
      { id: 'people', label: '🤝 Pairing requests', badge: waitingAsks, urgent: waitingAsks > 0 },
      { id: 'guild', label: '💬 Guides\u2019 room' },
    ];

  // Remembered per role, like the Director's screen: a Guide who lives in
  // Lesson studies should land there tomorrow, and a Director's habit is their
  // own rather than everybody's.
  //
  // THE OLD DEEP LINK STILL HAS TO ARRIVE SOMEWHERE. The desk rail pointed at
  // `/office#pairing-requests` and that card now lives inside a subroom, so the
  // hash would land on a panel that is not drawn. The link itself has been
  // changed to `?room=people`; the translation is for the open tab and the
  // installed copy that has not refreshed yet.
  const [room, chooseRoom] = useRoom(
    rooms,
    `beacon:office-room:${profile?.role ?? 'none'}`,
    { 'pairing-requests': 'people', studies: 'studies', library: 'library' },
  );

  if (!profile) return null;

  return (
    <div className="space-y-5">
      <Heading
        subtitle={
          leads
            ? 'The numbers, the files you can take away, and the things you write.'
            : 'Your numbers, the studies you write, and the shelf you stock.'
        }
      />

      <RoomTabs rooms={rooms} room={room} onChoose={chooseRoom} />

      {/* THE NUMBERS. They are the reason leadership opens this room on a
          Tuesday morning, which is why they are the first subroom for a
          Director and the last for a Guide: a Guide comes here to write. */}
      {room === 'numbers' && <LiveAnalytics churchName={churchName} />}

      {/* Printing for a board meeting and downloading the figures are the same
          errand, so they share a subroom rather than each taking a tab. */}
      {room === 'reports' && leads && (
        <>
          <LiveBoardReport churchName={churchName} />
          <LiveExport churchName={churchName} />
        </>
      )}

      {/* WRITING AND STOCKING, for everyone who has this room. A Guide writing
          a study and a Director writing one are the same act, and the database
          has said so since migration 0038. Passing the Guide's own pairings
          gives them the share-with-one-person buttons; leadership gets
          add-and-publish, which is right: stocking the shelf is a Director's
          job, handing a book to one person is a Guide's.

          These are two subrooms rather than one. "Write a study" and "stock the
          shelf" are different errands, and the shelf is long. */}
      {room === 'studies' && <LiveStudies />}
      {room === 'library' && <LiveLibraryForGuide pairings={pairings} />}

      {/* PUTTING A NAME FORWARD, whichever direction it goes.
          A Guide could recommend a NEW person for an invitation and could do
          nothing at all about an Explorer already in the church and waiting.
          The screen showing who is unpaired belonged to the Director, so the
          people with room to carry somebody had no way to say so. Both acts are
          the same errand from the two ends, so they share a subroom. */}
      {room === 'people' && (
        <>
          {isGuide && <LiveAskToWalkWith />}
          {isGuide && <LiveRecommend />}
          {leads && <LivePairingRequestsForDirector />}
        </>
      )}

      {/* THE GUIDES' ROOM. Every conversation surface in this app is one Guide
          with one Explorer, which is right for that relationship and leaves a
          Guide with a hard week entirely alone. Directors are in it too: a
          guild whose leaders cannot hear it is not being led.

          It is a subroom of its own because it is a conversation: it scrolls
          inside itself and had no business sitting at the bottom of a page that
          also scrolls. */}
      {room === 'guild' && <LiveGuildRoom />}
    </div>
  );
}

/**
 * The tutorial's office, with the tutorial's own tools in it.
 *
 * PARITY IS THE POINT. Somebody who learns the job in the demo and then signs
 * in should find the same rooms in the same places. A demo that says "this
 * exists but not here" teaches the shape of the app wrong, and every complaint
 * this session has ultimately been that gap.
 *
 * The numbers are the demo's invented ones, which the tutorial banner says on
 * every screen, and the practice is in reading the room rather than the figures.
 */
function DemoOffice() {
  // PARITY IN SHAPE, NOT JUST IN CONTENT. Somebody who learns the job here and
  // then signs in should find the same room with the same strip across the top.
  // A tutorial that teaches one long page and a live app that has subrooms
  // teaches the shape of the app wrong, which is the whole reason this file
  // carries a demo half at all.
  const rooms: Room[] = [
    { id: 'numbers', label: '📈 Numbers' },
    { id: 'studies', label: '📖 Lesson studies' },
  ];
  const [room, chooseRoom] = useRoom(rooms, 'beacon:office-room:demo');

  return (
    <div className="space-y-5">
      <Heading subtitle="The numbers, and the shelf you stock. Sample data." />
      <RoomTabs rooms={rooms} room={room} onChoose={chooseRoom} />
      {room === 'numbers' && (
        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">📈 How the church is going</h2>
          <p className="mt-1 text-sm text-gray-500">
            Invented numbers, for practice. The live office shows your own.
          </p>
          <div className="mt-4">
            <Analytics />
          </div>
        </Card>
      )}
      {room === 'studies' && <LessonSeriesLibrary />}
    </div>
  );
}

export default function OfficePage() {
  if (useIsLive()) {
    return <LiveAppShell allow={WORKERS}><LiveOffice /></LiveAppShell>;
  }
  return <AppShell allow={WORKERS}><DemoOffice /></AppShell>;
}

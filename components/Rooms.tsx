'use client';

import { useEffect, useRef, useState } from 'react';
import { useUrlKey } from '@/lib/url-signal';
import { SubroomMenu } from '@/components/SubroomMenu';

// Rooms, not a scroll.
//
// See docs/DESIGN.md, rule 1. The app is a church with rooms in it, and the
// room somebody needs most often is the first one. A Director pairs people and
// approves people every week and reads the board report once a month; pairing
// used to be the ninth section down one long page, so the most-used control in
// the app took the most scrolling to reach.
//
// WHY THE CHOICE IS REMEMBERED. Familiarity is the point. Somebody who works in
// Pairings all day should land in Pairings tomorrow, not be returned to a
// default they have to walk past again. It is stored per role, so a Director
// and an Executive keep their own places.
//
// IT IS A DROP-DOWN NOW, by the owner's decision on 30 September 2026: the
// strip scrolled sideways, and people did not know to swipe it to find the
// rooms past the edge of a phone. This file used to say why it was NOT a
// drop-down -- a closed menu hides how many rooms exist and what is waiting in
// them -- and that is answered on the closed button instead: "2 of 4", and the
// count waiting elsewhere. components/SubroomMenu.tsx.

export interface Room {
  id: string;
  label: string;
  /** Shown as a count beside the label. Omit when there is nothing to count. */
  badge?: number;
  /** Drawn in a way that says "this needs doing", not "this is a total". */
  urgent?: boolean;
}

/**
 * Which room of a tabbed screen is open.
 *
 * `?room=approvals` IN THE ADDRESS WINS OVER THE REMEMBERED ONE, and that is
 * what makes a tabbed screen linkable at all. Without it every link to this
 * page landed on whichever tab the person last used, so "3 people waiting to be
 * approved" opened Admin on Pairings and left somebody hunting for the thing
 * they had just pressed. Being sent to the right building and left to find the
 * room is the same as not being sent.
 *
 * The remembered room is still right for someone opening the page themselves:
 * a Director who lives in Approvals should land there. A link is an explicit
 * request and beats a habit.
 */
export function useRoom(
  rooms: Room[],
  storageKey: string,
  /**
   * `#card` in the address, translated to the subroom that draws that card.
   *
   * Anchors were written before any of these screens had subrooms, and they
   * point at cards: `/settings#install`, `/office#pairing-requests`. Once the
   * card lives inside a subroom, the hash names something the page is not
   * drawing, and the person arrives at a room with nothing in it — which is
   * the complaint this whole mechanism came from, restated.
   *
   * The links themselves have been changed to `?room=`, but an open tab or an
   * installed copy that has not refreshed is still holding the old address, so
   * the translation stays.
   */
  hashAliases: Record<string, string> = {},
): [string, (id: string) => void] {
  const first = rooms[0]?.id ?? '';
  const [room, setRoom] = useState(first);
  // Re-read on every address change, not just on mount. The desk rail is drawn
  // ON the admin page, so its `?room=` links are usually pressed from the very
  // page they point at — no unmount, no re-render, and a link that did nothing.
  const url = useUrlKey();
  const restored = useRef(false);

  // Read after mount, never during render: the server has no localStorage, and
  // reading it while rendering makes the first paint disagree with the second.
  useEffect(() => {
    let asked = '';
    try {
      asked = new URLSearchParams(window.location.search).get('room') ?? '';
    } catch { /* no window, or no search */ }

    // A hash is as explicit a request as a query string, so it beats the
    // remembered room for the same reason.
    let hash = '';
    try { hash = window.location.hash.replace('#', ''); } catch { /* no window */ }
    const viaHash = hashAliases[hash];
    if (!asked && viaHash && rooms.some((r) => r.id === viaHash)) {
      setRoom(viaHash);
      try { localStorage.setItem(storageKey, viaHash); } catch {}
      return;
    }

    if (asked && rooms.some((r) => r.id === asked)) {
      setRoom(asked);
      // Remember it too, so pressing the link and then coming back later lands
      // where the person was rather than where they were three visits ago.
      try { localStorage.setItem(storageKey, asked); } catch {}
      return;
    }

    // The remembered room is a first impression, not a correction. Applying it
    // on every address change would drag somebody back out of the tab they just
    // picked by hand the moment anything else touched the URL.
    if (restored.current) return;
    restored.current = true;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && rooms.some((r) => r.id === saved)) setRoom(saved);
    } catch { /* a private window is not a reason to lose the page */ }
    // rooms is rebuilt every render; comparing ids would be the only honest
    // dependency and it does not change after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, url]);

  const choose = (id: string) => {
    setRoom(id);
    try { localStorage.setItem(storageKey, id); } catch {}
  };

  return [room, choose];
}

export function RoomTabs({
  rooms,
  room,
  onChoose,
  quest = 'rooms-menu',
}: {
  rooms: Room[];
  room: string;
  onChoose: (id: string) => void;
  /** The tutorial's name for this page's drop-down, when a step points at it. */
  quest?: string;
}) {
  return (
    <SubroomMenu
      label="Rooms"
      quest={quest}
      active={room}
      onChoose={onChoose}
      items={rooms.map((r) => ({
        id: r.id,
        label: r.label,
        text: r.label,
        badge: r.badge,
        tone: r.urgent ? 'urgent' : undefined,
        // So the tutorial can point at a room the way it already points at a
        // tab, and so the walks and the desk's `?room=` links can find it.
        quest: `room-${r.id}`,
        room: r.id,
      }))}
    />
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { usePublishedHeight } from '@/lib/published-height';
import { useDemo } from '@/lib/demo/store';
import { roleLabel, NAVY, APP_SHORT_NAME } from '@/lib/brand';
import { unseenCount } from '@/lib/release-notes';
import { useUpdateState } from '@/lib/app-update';
import type { Role } from '@/lib/types';
import { Avatar } from './ui';
import { NotificationBell } from './NotificationBell';
import { RoleSwitcher } from './RoleSwitcher';
import { RightRail, railGroupsFor } from './RoomRails';
import { useLookPalette, useRoom } from '@/lib/room-theme';
import { emitQuest } from '@/lib/quest';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { BackButton } from '@/components/BackButton';
import { useIsLive } from '@/lib/tutorial';
import { ModeSwitch } from '@/components/ModeSwitch';
import { InstallChip } from '@/components/InstallChip';
import { LiveAppShell, LiveUnsupported } from '@/components/LiveAppShell';
import { useScrollToHash } from '@/lib/scroll-to-hash';
import { useUrlKey } from '@/lib/url-signal';
import { TabBar } from '@/components/TabBar';
import { DemoTalkDock } from '@/components/DemoTalkDock';
import { DeskDrawer } from '@/components/DeskDrawer';

const NAV: Record<Role, { href: string; label: string }[]> = {
  executive: [{ href: '/admin', label: 'Admin' }],
  admin: [{ href: '/admin', label: 'Admin' }],
  dm: [{ href: '/dm', label: 'My Explorers' }],
  ds: [{ href: '/ds', label: 'My Journey' }],
};

// AppShell wraps every signed-in screen: the top bar, the role guard, and — on
// a wide screen — the person's own room either side of the page. In this build
// the role guard is the whole story: everything is sample data in the browser,
// so a "wrong role" screen only ever exposes made-up people. There is no
// backend here to protect (see ARCHITECTURE.md).
export function AppShell({
  allow,
  children,
}: {
  allow: Role[];
  children: React.ReactNode;
}) {
  if (useIsLive()) {
    return (
      <LiveAppShell allow={allow}>
        <LiveUnsupported />
      </LiveAppShell>
    );
  }
  return <DemoAppShell allow={allow}>{children}</DemoAppShell>;
}

/**
 * The sample side's rooms, with their counts, for whoever is signed in.
 *
 * One place, because two screens draw them: the left rail on a desktop, and
 * the Menu tab on a phone or a pad (app/menu/page.tsx). Computed twice, they
 * would be two lists that agree today.
 *
 * A hook because the update badge reads the service worker's state and this
 * device's unread release notes; it must run on every render, above any early
 * return, which is why DemoAppShell calls it before its guard.
 */
export function useDemoRooms() {
  const { db, currentUser } = useDemo();
  // localStorage does not exist during the server render, so the note count is
  // read after mount rather than during it.
  const appUpdate = useUpdateState();
  const [unseenNotes, setUnseenNotes] = useState(0);
  useEffect(() => setUnseenNotes(unseenCount()), []);

  const unreadMail = currentUser
    ? db.emails.filter((e) => e.to_user_id === currentUser.id && !e.opened_at).length
    : 0;
  const pendingApprovals = db.profiles.filter((p) => !p.is_approved).length;
  const mySeekers = currentUser
    ? db.pairings.filter((p) => p.dm_id === currentUser.id && p.status === 'active').length
    : 0;

  // An update waiting to be applied outranks unread notes: it is the one that
  // needs an action rather than a read.
  const groups = currentUser
    ? railGroupsFor(currentUser.role, {
        mail: unreadMail,
        approvals: pendingApprovals,
        seekers: mySeekers,
        updates: appUpdate.state === 'ready' ? 1 : unseenNotes,
      })
    : [];

  return { groups, unreadMail, pendingApprovals, mySeekers };
}

function DemoAppShell({
  allow,
  children,
}: {
  allow: Role[];
  children: React.ReactNode;
}) {
  const { db, currentUser } = useDemo();
  const router = useRouter();

  // Room prefs are per-person and per-device. Hooks must run unconditionally,
  // so this sits above the guard's early return.
  const role: Role = currentUser?.role ?? 'ds';
  const { prefs, update, theme, themes, chosen, choose, recolours } = useRoom(currentUser?.id ?? null, role);
  // Under Beacon, Study or Focus a chosen palette recolours the look.
  useLookPalette(theme, recolours);

  // Land on the card a `#link` names, once it exists. The same wiring as the
  // live shell — the Install chip points at `/settings#install` in both modes,
  // and pressing it from Settings itself scrolls nowhere without this.
  const url = useUrlKey();
  useScrollToHash([url]);

  // Above the guard's early return for the same reason as the line before it:
  // hooks must run on every render, and putting these below the `return null`
  // makes the hook count change the moment someone signs in, which React reports
  // as "rendered more hooks than during the previous render" and then unmounts
  // the tree.
  const { unreadMail, pendingApprovals, mySeekers } = useDemoRooms();

  useEffect(() => {
    // Signed out is the only reason to send someone to /login. Being signed in
    // on a screen your role cannot see is not an authentication problem — it is
    // a wrong turn, so forward to the home your role *does* have. That also
    // makes the demo's role switcher work: change role and the page you are
    // standing on hands you to the right one instead of throwing you out.
    if (!currentUser) router.replace('/login');
    else if (!allow.includes(currentUser.role)) {
      router.replace(NAV[currentUser.role][0].href);
    }
  }, [currentUser, allow, router]);

  // WHAT THE STICKY HEADER STANDS ON.
  //
  // The header is sticky, so it is out of the document's flow at the top the
  // same way the install bar is at the bottom, and anything scrolled to lands
  // UNDERNEATH it. Reserving room below the install bar surfaced this: with
  // the bottom fixed, WebKit scrolled the sign-in list up and parked a name
  // behind the header instead. One overlay was hiding the other.
  //
  // Publishing the measured height lets `scroll-padding-top` in globals.css
  // add it to `--beacon-chrome-top` (the tutorial bar, when there is one), so
  // a scrolled-to control comes to rest below BOTH rather than behind either.
  //
  // Above the guard, like every other hook here. It sat below the early return,
  // so a sign-out on a screen inside this shell (Switch account, which is in
  // the Menu now) rendered fewer hooks than the render before it, which React
  // treats as an error. With no header drawn the effect simply finds no
  // element and does nothing.
  // The row rewraps at `sm`, so the height is not a constant; see
  // lib/published-height.ts for how it is measured.
  const headerRef = usePublishedHeight('--app-header');

  if (!currentUser || !allow.includes(currentUser.role)) return null;

  // What a staff member sees on their desk. A seeker gets a study timer here
  // instead — their room is not a work queue.
  const today: { label: string; value: string }[] = [];
  if (currentUser.role === 'admin' || currentUser.role === 'executive') {
    today.push({ label: 'Waiting for approval', value: String(pendingApprovals) });
    today.push({ label: 'Unread mail', value: String(unreadMail) });
    today.push({ label: 'People', value: String(db.profiles.length) });
  } else if (currentUser.role === 'dm') {
    today.push({ label: 'My explorers', value: String(mySeekers) });
    today.push({
      label: 'Follow-ups open',
      value: String(
        db.follow_ups.filter((f) => f.owner_id === currentUser.id && !f.done_at)
          .length,
      ),
    });
    today.push({ label: 'Unread mail', value: String(unreadMail) });
  }

  return (
    <div className="room-surface min-h-screen" style={{ background: theme.bg }}>
      <header
        ref={headerRef}
        // data-app-header and data-header-brand are hooks for a look's own
        // stylesheet (app/themes/*.css). They change nothing about Classic.
        data-app-header
        className="no-print sticky z-20 text-white shadow-md"
        // Sticks BELOW the tutorial bar when there is one. `top-0` pinned it
        // to the viewport, which put it under that bar and made the top of
        // the header unclickable. TutorialBar sets the variable; 0 otherwise.
        style={{ backgroundColor: NAVY, top: 'var(--beacon-chrome-top, 0px)' }}
      >
        {/* The header carries a lot for a 360px phone: brand, four controls,
            an identity and a way out. Everything below that is not essential
            at that width either hides or shrinks, because the alternative is
            the row overflowing — which also drags the notification panel
            anchored inside it off the side of the screen. */}
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-2 px-3 py-3 max-sm:flex-wrap max-sm:gap-1 sm:gap-3 sm:px-4">
          {/* Below `sm` the mark stands alone. Six controls at a 44px tap
              target leave no room for a wordmark on a 360px phone, and a
              squeezed-to-nothing "Beacon" reads as a bug — an icon-only logo
              reads as a decision. The name comes back the moment there is
              room for it. */}
          {/* The tighter gap below `sm` is what lets the first row hold the
              brand, the three pinned controls and the way out on a 360px
              phone now that the rooms have a row of their own. */}
          <div className="flex shrink-0 items-center gap-2 max-sm:gap-1 sm:gap-3">
            {/* An installed app has no browser Back on iOS, and none at all
                until the manifest's minimal-ui request is honoured. This is
                the one that works everywhere. */}
            <BackButton home={NAV[currentUser.role][0].href} />
            {/* The way back to the live app. Somebody who opened the tutorial
                to look around has to be able to leave it, and until this was
                here the only route out was editing the address bar. */}
            <ModeSwitch onDark />
            <InstallChip onDark />
            <Link
              href={NAV[currentUser.role][0].href}
              data-header-brand
              className="flex shrink-0 items-center gap-2 sm:gap-3"
              aria-label={`${APP_SHORT_NAME} home`}
            >
              <SentryBeaconMark size={38} />
              <div className="hidden leading-tight sm:block">
                <p className="text-xl font-extrabold tracking-tight">{APP_SHORT_NAME}</p>
                <p className="text-xs text-white/60">Disciple-making journey</p>
              </div>
            </Link>
          </div>

          {/* NO ROOMS UP HERE AT ANY WIDTH (30 September 2026). This header
              used to carry every room as a strip of icons that scrolled
              sideways, and its notes recorded what that cost: icons resting on
              the logo, the church link hidden in a sliver narrower than itself,
              two controls simply gone from a 360px screen. The bottom bar
              (Menu, People, My Files) is the navigation on a phone, a pad and a
              desktop alike, asked for in those words: "the same dropdown and UI
              with Desktops". What stays up here is the brand and what is about
              the person: the role switcher, the bell, and their own face. */}
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-3">
            {/* Pinned, and it HAS to be pinned — this is not a preference.
                It used to sit inside the scrolling strip above, and a strip is
                `overflow-x: auto`, which makes it a clipping box. The button
                still toggled, the panel still entered the DOM, and on a desktop
                it was then clipped to the strip's 44px height: measured with
                elementFromPoint, the centre of the open panel hit a header link
                rather than the panel. From the outside that is a button that
                does nothing, which is exactly how it was reported.

                A phone was unaffected, because below `sm` the panel is
                `position: fixed` and escapes the overflow — so the bug looked
                intermittent and device-specific when it was neither.

                Anything that opens a layer must live outside the strip. */}
            <RoleSwitcher />
            {/* Pinned, not in the strip. It carries an unread count, and a
                badge you have to go looking for is a badge that does not work. */}
            <NotificationBell />
            <Link
              href="/profile"
              data-quest="profile-link"
              onClick={() => emitQuest('beacon:profile')}
              className="flex shrink-0 items-center gap-2 rounded-full sm:rounded-xl sm:bg-white/10 sm:px-2 sm:py-1 sm:hover:bg-white/20"
              title="Your profile"
            >
              <div className="hidden text-right lg:block">
                <p className="text-sm font-semibold leading-tight">
                  {currentUser.full_name}
                </p>
                {roleLabel(currentUser.role, currentUser.role) && (
                  <p className="text-xs text-white/60">
                    {roleLabel(currentUser.role, currentUser.role)}
                  </p>
                )}
              </div>
              <Avatar
                name={currentUser.full_name}
                size={36}
                photo={currentUser.photo}
                avatar={currentUser.avatar}
                onDark
              />
            </Link>
          </div>
        </div>
      </header>

      {/* The page, and the person's own desk beside it from `xl` up; below
          that the desk is a drawer from the right edge (DeskDrawer). There is no left column any
          more: the bottom bar is the navigation at every width. */}
      <div className="mx-auto flex max-w-[1600px] flex-col items-stretch gap-6 px-4 xl:flex-row xl:items-start">

        {/* The floor is deliberately deep.
            Beacon floats several things over the bottom of the screen: the
            tutorial's 'Resume' pill, the install prompt, the feedback nudge and
            the outbox toast. With `py-6` the last card on a page ended level
            with them, so the pill sat across the words of a shared resource —
            photographed on a real phone and sent back. A page that can scroll
            a little further past its own content costs nothing and means
            nothing floating ever has the last line to itself. */}
        <main className="page-in mx-auto w-full min-w-0 max-w-5xl pb-28 pt-6">
          {children}

          {/* The same placement the live shell uses, for the same reason: the
              right rail starts at 1280px, so without this the pocket is missing
              from every phone and every tablet. Kept in step with the live shell
              deliberately -- a folder that existed in the tutorial and not in
              the real app is exactly the defect the settings parity check was
              written for. */}
        </main>

        {prefs.rightRail && (
          // A DRAWER BELOW 1280px, the column beside the page above it.
          <DeskDrawer label={currentUser.role === 'ds' ? 'My room' : 'My office'}>
          <RightRail
            role={currentUser.role}
            name={currentUser.full_name}
            theme={theme}
            themes={themes}
            prefs={prefs}
            update={update}
            chosen={chosen}
            choose={choose}
            today={today}
          />
          </DeskDrawer>
        )}
      </div>

      <TabBar role={currentUser.role} />

      {/* The chat, as a bubble, for the two people who have conversations: the
          live shell's TalkDock, drawn from the sample store. */}
      <DemoTalkDock />
    </div>
  );
}

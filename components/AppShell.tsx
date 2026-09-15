'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { roleLabel, NAVY, APP_SHORT_NAME } from '@/lib/brand';
import { unseenCount } from '@/lib/release-notes';
import { useUpdateState } from '@/lib/app-update';
import type { Role } from '@/lib/types';
import { Avatar } from './ui';
import { NotificationBell } from './NotificationBell';
import { RoleSwitcher } from './RoleSwitcher';
import { LeftRail, RightRail, railGroupsFor } from './RoomRails';
import { Pocket } from '@/components/Pocket';
import { useRoom } from '@/lib/room-theme';
import { emitQuest } from '@/lib/quest';
import { useLocale } from '@/lib/i18n';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { BackButton } from '@/components/BackButton';
import { useIsLive } from '@/lib/tutorial';
import { ModeSwitch } from '@/components/ModeSwitch';
import { InstallChip } from '@/components/InstallChip';
import { LiveAppShell, LiveUnsupported } from '@/components/LiveAppShell';
import { useScrollToHash } from '@/lib/scroll-to-hash';
import { useUrlKey } from '@/lib/url-signal';

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

function DemoAppShell({
  allow,
  children,
}: {
  allow: Role[];
  children: React.ReactNode;
}) {
  const { db, currentUser, signOut } = useDemo();
  const { t } = useLocale();
  const router = useRouter();

  // Room prefs are per-person and per-device. Hooks must run unconditionally,
  // so this sits above the guard's early return.
  const role: Role = currentUser?.role ?? 'ds';
  const { prefs, update, theme, themes } = useRoom(currentUser?.id ?? null, role);

  // Land on the card a `#link` names, once it exists. The same wiring as the
  // live shell — the Install chip points at `/settings#install` in both modes,
  // and pressing it from Settings itself scrolls nowhere without this.
  const url = useUrlKey();
  useScrollToHash([url]);

  // Above the guard's early return for the same reason as the line before it:
  // hooks must run on every render, and putting these below the `return null`
  // makes the hook count change the moment someone signs in, which React reports
  // as "rendered more hooks than during the previous render" and then unmounts
  // the tree. localStorage does not exist during the server render, so the note
  // count is read after mount rather than during it.
  const appUpdate = useUpdateState();
  const [unseenNotes, setUnseenNotes] = useState(0);
  useEffect(() => setUnseenNotes(unseenCount()), []);

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

  if (!currentUser || !allow.includes(currentUser.role)) return null;

  const unreadMail = db.emails.filter(
    (e) => e.to_user_id === currentUser.id && !e.opened_at,
  ).length;
  const pendingApprovals = db.profiles.filter((p) => !p.is_approved).length;
  const mySeekers = db.pairings.filter(
    (p) => p.dm_id === currentUser.id && p.status === 'active',
  ).length;

  // An update waiting to be applied outranks unread notes: it is the one that
  // needs an action rather than a read.
  const groups = railGroupsFor(currentUser.role, {
    mail: unreadMail,
    approvals: pendingApprovals,
    seekers: mySeekers,
    updates: appUpdate.state === 'ready' ? 1 : unseenNotes,
  });

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
  const headerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty(
        '--app-header',
        `${Math.ceil(el.getBoundingClientRect().height)}px`,
      );
    publish();
    // The row rewraps at `sm`, so the height is not a constant.
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--app-header');
    };
  });

  return (
    <div className="room-surface min-h-screen" style={{ background: theme.bg }}>
      <header
        ref={headerRef}
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
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4">
          {/* Below `sm` the mark stands alone. Six controls at a 44px tap
              target leave no room for a wordmark on a 360px phone, and a
              squeezed-to-nothing "Beacon" reads as a bug — an icon-only logo
              reads as a decision. The name comes back the moment there is
              room for it. */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
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

          {/* The feature icons scroll; who you are and the way out do not.
              A phone header cannot hold eight 44px controls. They used to be
              `shrink-0` in a row that could not shrink either, so the row simply
              overflowed and the first icon came to rest ON TOP of the logo —
              which is what a church director photographed and sent back. Making
              the icons smaller would have been the wrong answer: they are tap
              targets on a phone, and the whole point of them is being easy to
              hit.

              So the row of features became a strip you can push sideways with a
              thumb, and the two controls nobody should ever have to hunt for —
              your own face, and the way out — stay pinned to the right of it. */}
          <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-3">
            {/* The scroller is sized by its own content, and the ROW around it
                does the right-aligning.
                The first attempt put `justify-end` on the scrolling content
                itself. That does not scroll: in a flex container aligned to the
                end, the overflow goes off the START edge and no browser will let
                you reach it. It measured as "no overflow" while two controls —
                the church link and the account switcher — were simply gone from
                a 360px screen. Sizing the scroller to its content instead means
                the overflow goes off the END, which is reachable by thumb,
                trackpad and keyboard. */}
            <div className="relative min-w-0">
              <div className="no-scrollbar min-w-0 overflow-x-auto">
                <div className="flex w-max items-center gap-1 sm:gap-3">
            {/* Reachable on a phone, which it was not.
                This link was `lg:inline-flex`, the left rail that also links
                here is `xl:block`, and there is no other route to /church
                anywhere in the signed-in app. So on a 412px screen the church
                home — the activity board, the prayer wall, the journey chart —
                simply could not be opened. Found while anchoring a tutorial
                step at it, which is the only reason anybody noticed.

                Now it behaves like the library and mail buttons beside it: an
                icon on a phone, the full label from lg up. */}
            <Link
              href="/church"
              aria-label={t('church')}
              title={t('church')}
              data-quest="church-link"
              onClick={() => emitQuest('beacon:open-church')}
              className="tap-sm grid shrink-0 place-items-center rounded-full bg-white/10 px-0 font-semibold hover:bg-white/20 lg:inline-flex lg:h-auto lg:w-auto lg:items-center lg:gap-1 lg:rounded-xl lg:px-3 lg:text-sm"
            >
              <span aria-hidden>⛪</span>
              <span className="hidden lg:inline">{t('church')}</span>
            </Link>
            <Link
              href="/library"
              aria-label="My Library"
              title="My Library"
              className="tap-sm grid shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <span aria-hidden>📚</span>
            </Link>
            {/* OFFICE, PUBLISH AND CASES, which were on the rails and nowhere
                else below `xl`. Same gap the church link had, recorded in the
                note above it, and the same cause: rooms added after this strip
                was written and never added to it. A Guide writes their own
                lesson studies in the Office, so on a phone they could not.

                The strip scrolls, so length is not the constraint it once was.
                Explorers get no Office: none of the work in it is theirs. */}
            {currentUser.role !== 'ds' && (
              <Link
                href="/office"
                aria-label="Office"
                title="Office"
                className="tap-sm grid shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20"
              >
                <span aria-hidden>🗂️</span>
              </Link>
            )}
            <Link
              href="/publish"
              aria-label="Publish"
              title="Publish"
              className="tap-sm grid shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <span aria-hidden>✍️</span>
            </Link>
            <Link
              href="/cases"
              aria-label="Cases"
              title="Cases"
              className="tap-sm grid shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <span aria-hidden>⚖️</span>
            </Link>
            <Link
              href="/mail"
              aria-label="Mail"
              title="Mail"
              className="tap-sm relative grid shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <span aria-hidden>✉️</span>
              {unreadMail > 0 && (
                <span
                  className="absolute right-0 top-0.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold text-navy"
                  style={{ backgroundColor: '#E8B84B' }}
                >
                  {unreadMail}
                </span>
              )}
            </Link>
            {/* Settings was hidden below `lg` to make room for Mail. The strip
                scrolls now, so there is room, and a setting nobody can find is
                a setting nobody changes. */}
            <Link
              href="/settings"
              aria-label={t('settings')}
              title={t('settings')}
              className="tap-sm grid shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <span aria-hidden>⚙️</span>
            </Link>
                </div>
              </div>
              {/* Navy fading to nothing on the trailing edge, which is the side
                  icons hide behind. Over a navy header it is invisible until
                  something slides under it: free when everything fits, and a
                  "there is more this way" cue when it does not. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-7"
                style={{ background: `linear-gradient(to left, ${NAVY}, transparent)` }}
              />
            </div>
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
            <button
              onClick={() => {
                signOut();
                router.replace('/login');
              }}
              aria-label="Switch account"
              title="Switch account"
              className="tap-sm grid shrink-0 place-items-center rounded-full bg-white/10 px-0 text-sm font-semibold hover:bg-white/20 sm:rounded-xl sm:px-3"
            >
              <span aria-hidden className="sm:hidden">⇄</span>
              <span className="hidden sm:inline">Switch</span>
            </button>
          </div>
        </div>
      </header>

      {/* Three columns from `xl` up; a single column everywhere else. The rails
          never appear on a phone or tablet — there is no room for them, and the
          page they flank is the one that matters. */}
      <div className="mx-auto flex max-w-[1600px] items-start gap-6 px-4">
        {prefs.leftRail && <LeftRail groups={groups} theme={theme} />}

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
          {prefs.rightRail && <Pocket theme={theme} className="mt-6 xl:hidden" />}
        </main>

        {prefs.rightRail && (
          <RightRail
            role={currentUser.role}
            name={currentUser.full_name}
            theme={theme}
            themes={themes}
            prefs={prefs}
            update={update}
            today={today}
          />
        )}
      </div>
    </div>
  );
}

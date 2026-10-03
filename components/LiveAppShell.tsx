'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { roleLabel, NAVY, APP_SHORT_NAME } from '@/lib/brand';
import type { Role } from '@/lib/types';
import { homeFor, useLiveSession } from '@/lib/live/session';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { BeaconSplash } from '@/components/BeaconLoader';
import { Avatar, Button, Card } from '@/components/ui';
import { RightRail } from '@/components/RoomRails';
import { DeskDrawer } from '@/components/DeskDrawer';
import { LiveDesk } from '@/components/LiveDesk';
import { useRoom } from '@/lib/room-theme';
import { LiveBell } from '@/components/LiveBell';
import { TalkDock } from '@/components/live/TalkDock';
import { ModeSwitch } from '@/components/ModeSwitch';
import { PowerGlyph } from '@/components/Glyph';
import { useScrollToHash } from '@/lib/scroll-to-hash';
import { useUrlKey } from '@/lib/url-signal';
import { TabBar } from '@/components/TabBar';
import { BackButton } from '@/components/BackButton';

// THE HEADER CARRIES NO LIST OF ROOMS ANY MORE (30 September 2026).
//
// Below 1280px this file used to hold SECTIONS, a second list of every room,
// drawn as a row of emoji under the header because the rail is `xl:block` and
// that row was the only way around a phone or a pad. Keeping two lists in step
// was its own defect: for several weeks the Office, Publish and Cases were on
// the rail and missing from the row, so a Guide could write lesson studies on a
// Mac and nowhere else.
//
// The row is gone, and so is the second list. A phone and a pad steer by the
// bottom bar (components/TabBar.tsx): Menu, People, My Files. Menu draws every
// room from railGroupsFor() in RoomRails.tsx, the same list the desktop rail
// draws, so there is one list and it cannot disagree with itself. Everything
// the old notes here decided still holds, because it was decided in that list
// too: Talk is the bubble and not a room, the Guild Room is archived, Mail and
// Admin Reports are for leadership, the Apps room became the pocket.
// tests/the-bottom-bar.mjs holds that the header stays this short.

export function LiveAppShell({
  allow,
  children,
}: {
  allow: Role[];
  children: React.ReactNode;
}) {
  const { session, profile, loading, error, signOut } = useLiveSession();
  const router = useRouter();

  // The office. These are the same rails the sample-data shell has used all
  // along — the right rail, the themes, the note, the ambient player.
  // They were never ported here, which is why the live app felt like a
  // different, smaller product than the one people were shown. Same components,
  // same hook, so the two cannot drift again without both drifting.
  //
  // Hidden below xl by the rails themselves, exactly as in the demo: a phone
  // and a tablet get the single column, because the page they flank is the one
  // that matters and there is no room for three.
  const room = useRoom(profile?.id ?? null, profile?.role ?? 'ds');

  // LAND ON THE CARD, NOT NEAR IT. Wired once here because every live screen
  // is inside this shell, so there is no page that can forget to do it.
  //
  // `#prayer`, `#ask-to-walk`, `#pairing-requests`, `#guides-room` are all
  // cards partway down long screens whose data arrives after the first paint.
  // A browser looking for them at navigation time finds nothing and gives up
  // without a word, which is the whole "it doesn't go to the feature I clicked"
  // complaint: the right page, and then abandoned on it. The hook waits for the
  // element instead of assuming it, and gives up after about three seconds.
  //
  // `pathname` and `loading` between them cover the two ways the target can
  // appear late: a different screen rendering, and this one's session
  // resolving.
  //
  // `url` and not just `pathname`: pressing `/dm#prayer` while already on /dm
  // changes the address without re-rendering anything, and the browser fires no
  // event for it. See lib/url-signal.ts.
  const url = useUrlKey();
  useScrollToHash([url, loading]);

  // THE HEADER SAYS HOW TALL IT IS, as the sample shell's always has
  // (components/AppShell.tsx). This one never did, so on the live side three
  // things that subtract the header's height subtracted nothing: the desk's
  // sticky column slid its first card under the header as the page scrolled
  // ("MY OFFICE" cut in half, on the owner's screen, 3 October 2026), a
  // scrolled-to card came to rest behind the header, and the conversation's
  // height left no room for it. Measured, because the header is taller on
  // the live side and rewraps on a phone. Above the guards, like every hook.
  const headerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty('--app-header', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--app-header');
    };
  });

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
    else if (profile?.is_approved && !allow.includes(profile.role)) {
      router.replace(homeFor(profile.role));
    }
  }, [session, profile, loading, allow, router]);

  // THE APP HAD THREE LOADING SCREENS AND SHOWED THE WORST ONE.
  //
  // `BeaconSplash` in components/BeaconLoader.tsx is the loading screen: the
  // mark with a halo breathing behind it, the name, one line, and a bar that
  // travels without claiming a percentage. It was written, and then nothing in
  // this repository ever rendered it. What people actually saw was a second,
  // plainer screen defined a few lines below here: flat navy, the mark, and a
  // hardcoded sentence.
  //
  // Two loading screens in one product are two answers to "is it working?",
  // and people learn one of them. The church app this grew out of uses the
  // splash at exactly this moment, which is what the owner asked for.
  if (loading) return <BeaconSplash label="Signing you in…" />;
  if (!session) return null;

  if (!profile) {
    return (
      <CenteredCard title="Your account is not ready">
        <p className="text-gray-600">{error || 'Ask your Director to check your account.'}</p>
        <Button
          className="mt-4"
          onClick={async () => {
            await signOut();
            router.replace('/login');
          }}
        >
          Sign out
        </Button>
      </CenteredCard>
    );
  }

  if (!profile.is_approved) {
    return (
      <CenteredCard title="Your account is being reviewed">
        {/* WHO, AND ROUGHLY WHEN. This is the first screen a new member ever
            sees, and it used to say only that somebody needed to approve them --
            no sense of who, how long, or whether anything was expected of them.
            Waiting without knowing whether anybody is there is most of what
            makes joining feel like shouting into a room. */}
        <p className="text-gray-600">
          Your invitation worked, and you are signed in. A Director has been told
          and will let you in, usually within a day or two.
        </p>
        <p className="mt-3 text-gray-600">
          There is nothing else for you to do. You do not need to sign up again or
          send another invitation, and you can close this and come back later.
        </p>
        <p className="mt-3 text-sm text-gray-500">
          Signed in as {session.user.email ?? profile.full_name}
        </p>
        <Button
          className="mt-5"
          onClick={async () => {
            await signOut();
            router.replace('/login');
          }}
        >
          Sign out
        </Button>
      </CenteredCard>
    );
  }

  if (!allow.includes(profile.role)) return null;

  return (
    // THE THEME PAINTS THE PAGE, WHICH IS WHAT MAKES IT A THEME.
    //
    // This was a hard-coded light grey, and only the rails were themed. The
    // left navigation draws its labels in theme.ink with no surface of its own,
    // so choosing Slate wrote near-white text straight onto that grey page and
    // the whole of the left column disappeared. The right rail looked fine
    // because it paints theme.panel behind itself.
    //
    // `room-surface` is the same class the tutorial's shell uses, so both now
    // agree on what a theme is: the page, the rails and the panels together.
    <div
      className="room-surface min-h-screen"
      style={{
        background: room.theme.bg,
        // PUBLISHED AS VARIABLES, not threaded through every screen. Cards
        // paint their own white surface and keep navy text; what needs these
        // is the text that sits directly on the page: page titles and the
        // lines under them. Those were hard-coded navy, which is invisible on
        // a dark theme, and the church name was the first thing to disappear.
        ['--room-ink' as string]: room.theme.ink,
        ['--room-ink-soft' as string]: room.theme.inkSoft,
        ['--room-line' as string]: room.theme.line,
        ['--room-accent' as string]: room.theme.accent,
      } as React.CSSProperties}
    >
      <header
        ref={headerRef}
        // Hooks for a look's own stylesheet (app/themes/*.css); nothing to Classic.
        data-app-header
        className="sticky z-20 text-white shadow-md"
        /* Sticks BELOW the tutorial bar when there is one. See AppShell. */
        style={{ backgroundColor: NAVY, top: 'var(--beacon-chrome-top, 0px)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-3 sm:px-4">
          {/* A WAY BACK THAT READS AS ONE. The sample header has always had
              it; this one had only the logo, and a logo does not read as a
              button to somebody who has never used the app. It matters more
              now that the bottom bar steps aside inside a conversation: an
              installed app on an iPhone has no browser Back, so without this a
              Guide in a conversation had no labelled way out. It is not drawn
              on the home screen, or when there is nowhere to go back to. */}
          <BackButton home={homeFor(profile.role)} />
          <Link
            href={homeFor(profile.role)}
            data-header-brand
            className="flex min-w-0 flex-1 items-center gap-3"
            aria-label={`${APP_SHORT_NAME} home`}
          >
            <SentryBeaconMark size={40} />
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold sm:text-xl">{APP_SHORT_NAME}</p>
              <p className="truncate text-xs text-white/60">Live church app</p>
            </div>
          </Link>

          <ModeSwitch onDark />
          <LiveBell me={profile} />

          {/* YOUR OWN FACE IS THE WAY TO YOUR PROFILE, as it is on the sample
              side and in every app people already use. It was a picture that
              did nothing, and Profile was an icon in the row of rooms; with
              the row gone, this and the card at the top of Menu are the two
              ways in. */}
          <Link
            href="/profile"
            className="flex min-w-0 shrink-0 items-center gap-3 rounded-full sm:rounded-xl sm:px-2 sm:py-1 sm:hover:bg-white/10"
            title="Your profile"
            aria-label="Your profile"
          >
            <div className="hidden min-w-0 text-right sm:block">
              <p className="max-w-48 truncate text-sm font-semibold">{profile.full_name}</p>
              <p className="text-xs text-white/60">{roleLabel(profile.role, profile.role)}</p>
            </div>
            <Avatar name={profile.full_name || session.user.email || 'Member'} size={36} onDark />
          </Link>
          <button
            className="tap-sm shrink-0 rounded-xl bg-white/10 px-3 hover:bg-white/20"
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              await signOut();
              router.replace('/login');
            }}
          >
            {/* The words cost about 85px, which is a fifth of a 390px phone and
                the difference between a header that fits and one that does not.
                Sign out lives nowhere else in the app, so it stays on every
                size — as a symbol where there is no room for the sentence. */}
            <span className="hidden text-sm font-semibold sm:inline">Sign out</span>
            {/* DRAWN, NOT TYPED. This was `⏻`, U+23FB, which is not an emoji
                and so has no guaranteed font behind it: an empty box on every
                Android phone, and perfect on the iPhone it was written on. */}
            <PowerGlyph size={20} className="sm:hidden" />
          </button>
        </div>

      </header>

      {/* The page, and the person's own desk beside it from xl up (below xl
          it is a drawer from the right edge, components/DeskDrawer.tsx) --
          the same breakpoint the sample-data shell uses. There is no left column any more: the bottom bar is the
          navigation at every width. */}
      <div className="mx-auto flex max-w-[1600px] flex-col items-stretch gap-6 px-4 xl:flex-row xl:items-start">

        {/* pb-28 rather than pb-24, matching the demo. Several things float
            over the bottom of the screen — the install prompt, the feedback
            nudge — and a page that can scroll a little past its own content is
            what stops them sitting across the last line of a card. */}
        <main className="page-in mx-auto w-full min-w-0 max-w-5xl pb-28 pt-6">
          {children}

          {/* THE POCKET IS NO LONGER DRAWN TWICE HERE.
              "can we add the pocket app features in pads and mobile too?" was
              answered by rendering a second copy of it at this spot, because the
              rail it lived in was `hidden ... xl:block` and every tablet and
              phone falls below 1280px. That fixed the pocket and left the rest
              of the rail where it was.
              The rail itself now stacks under this column below `xl` instead of
              hiding, so the pocket arrives with the timer and the theme picker
              rather than alone -- and as ONE instance rather than two, which the
              timer beside it requires. */}
        </main>

        {/* THE CHAT, WITHIN REACH FROM EVERY ROOM. Drawn once here rather than
            per page, so there is one of it and it cannot be forgotten on a
            screen somebody added later. It draws nothing on a phone, nothing
            for a Director, and nothing on /talk itself. */}
        <TalkDock />

        {room.prefs.rightRail && (
          // A DRAWER BELOW 1280px, the column beside the page above it.
          <DeskDrawer label={profile.role === 'ds' ? 'My room' : 'My office'}>
          <RightRail
            role={profile.role}
            name={profile.full_name}
            theme={room.theme}
            themes={room.themes}
            prefs={room.prefs}
            update={room.update}
            // THE DESK WAS ALWAYS EMPTY. This passed a hard-coded [], so every
            // signed-in person was told "Nothing waiting. A good place to be."
            // whatever was actually waiting: a panel that looked like a
            // considered empty state and had never been wired up. LiveDesk
            // loads what is coming up and what is outstanding.
            desk={<LiveDesk me={profile} theme={room.theme} />}
          />
          </DeskDrawer>
        )}
      </div>

      <footer className="border-t border-black/5 py-5 text-center text-xs text-gray-400">
        Invitation-only. Access is enforced by the church database.
      </footer>

      <TabBar role={profile.role} />
    </div>
  );
}

export function LiveUnsupported() {
  return (
    <Card className="p-6">
      <h1 className="text-2xl font-extrabold text-navy">This live screen is being connected</h1>
      <p className="mt-2 text-gray-600">
        The secure invitation, approval, pairing and conversation path is live. This supporting
        screen remains available in the separate sample-data demo.
      </p>
    </Card>
  );
}

function CenteredCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center px-4" style={{ backgroundColor: NAVY }}>
      <Card className="w-full max-w-md p-6 text-center">
        <SentryBeaconMark size={56} className="mx-auto" />
        <h1 className="mt-4 text-2xl font-extrabold text-navy">{title}</h1>
        <div className="mt-3">{children}</div>
      </Card>
    </div>
  );
}

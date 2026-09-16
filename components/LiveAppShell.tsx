'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { roleLabel, NAVY, APP_SHORT_NAME } from '@/lib/brand';
import type { Role } from '@/lib/types';
import { homeFor, useLiveSession } from '@/lib/live/session';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { BeaconSplash } from '@/components/BeaconLoader';
import { Avatar, Button, Card } from '@/components/ui';
import { LeftRail, RightRail, railGroupsFor } from '@/components/RoomRails';
import { LiveDesk } from '@/components/LiveDesk';
import { useRoom } from '@/lib/room-theme';
import { LiveBell } from '@/components/LiveBell';
import { TalkDock } from '@/components/live/TalkDock';
import { ModeSwitch } from '@/components/ModeSwitch';
import { PowerGlyph } from '@/components/Glyph';
import { useScrollToHash } from '@/lib/scroll-to-hash';
import { useUrlKey } from '@/lib/url-signal';

/** One header link. Icon on a phone, icon and word once there is room. */
/**
 * The sections live in one scrolling header row below `xl`. At `xl`, the left
 * room rail is visible and becomes the desktop navigation, so repeating every
 * room beside the account controls only crowds out the brand, LIVE state,
 * notification bell and member name.
 */
// MAIL IS FOR LEADERSHIP ONLY, and it used to be for everybody.
//
// /mail is the Invitations screen: who has been invited, who is still on the
// doorstep, and the button to send their link again. A Guide or an Explorer
// has none of that, so the page rendered a card telling them there was nothing
// for them to read. That is a navigation item whose entire content is an
// apology for existing, on every screen, for most of the church.
//
// The route still refuses them on its own; this only stops advertising it.
// EVERY ROOM THIS ROLE HAS, because below `xl` this header is the ONLY way
// around the app.
//
// THE BUG: "I need the lesson study editing features for guides to make their
// own lesson studies too, not just in mac or desktop."
//
// A Guide writes their own studies in the Office. The Office is on the rails —
// and the rails are `xl:block`, hidden below 1280px. This list was the entire
// navigation on every phone and tablet, and it held Church, Library, Profile
// and Settings. So the Office was reachable on a Mac and reachable nowhere
// else, along with Publish and Cases, all three of them rooms added after this
// list was written and never added to it.
//
// Nothing about the feature was missing. The door was.
//
// The row scrolls inside itself (`overflow-x-auto` below), which is why a
// longer list is safe — see the note on that element.
const SECTIONS = (role: Role) => [
  // TALK IS NOT IN THIS ROW ANY MORE, AND THAT IS THE POINT OF THE BUBBLE.
  //
  // It used to be first here, for a good reason at the time: the chat should
  // not be a card people scroll a page to reach. But an icon in the navigation
  // is still a PLACE YOU GO -- tapping it left whatever you were reading, threw
  // away where you had scrolled to, and put the conversation on a page of its
  // own. Reported with the icon circled in red: "you can take out the chat room
  // now since we already have the bubble."
  //
  // The bubble is on every screen size now and opens over the page rather than
  // instead of it, so the room in the navigation was a second, worse way in to
  // the same conversation -- and the one that cost somebody their place.
  //
  // /talk IS STILL A ROUTE. It is where "Open full" goes on a desktop, where a
  // 22rem corner panel genuinely is small, and it still works if somebody has
  // it bookmarked. What is gone is the standing invitation to leave the page.
  { href: '/church',   icon: '⛪', label: 'Church' },
  // THE GUILD ROOM IS ARCHIVED, NOT DELETED. Asked for plainly: "Take out the
  // Guild Room feature, archive it for now since most users dont like it."
  //
  // A door, a rail entry and the room's contents were the three things that
  // made it a place people went. The first two are gone; the third is not.
  // Every post, every amen and every guild still exists, `list_guild_activity`
  // still redacts exactly as it did, and -- the part that would have been an
  // accident -- LiveSafeguarding can still take down a reported guild post,
  // because a report about something said in that room outlives the room. The
  // three guild checks all test the database rather than the doorway, so they
  // stay green and stay meaningful.
  //
  // Putting it back is putting these lines back.
  // Not for Explorers: none of the work in it is theirs to do, and an empty
  // room tells somebody they are missing something. Same rule as the rail.
  ...(role !== 'ds'
    ? [{ href: '/office', icon: '🗂️', label: 'Office' }]
    : []),
  // Explorers only, matching the rail. See railGroupsFor.
  ...(role === 'ds' ? [{ href: '/study', icon: '📖', label: 'Study' }] : []),
  { href: '/publish',  icon: '✍️', label: 'Publish' },
  { href: '/library',  icon: '📚', label: 'Library' },
  // THE APPS ROOM IS RETIRED, AND THE POCKET REPLACES IT. "let's remove the
  // apps room. Instead let's develop a pocket, micro-app."
  //
  // The room asked a Director to curate a list for the whole church. The pocket
  // asks nothing of anybody: each person keeps their own handful of addresses
  // on their own desk, which is how people actually use Spotify, YouTube and
  // the office suite. See components/Pocket.tsx.
  // CASES IS LEADERSHIP'S ROOM NOW, AND IT IS CALLED ADMIN REPORTS.
  //
  // "Take out the cases in both Guide and Explorer, rebrand it and put it on
  // settings and make a sub room called 'Admin Reports'."
  //
  // A Guide or an Explorer had a scales-of-justice door in their sidebar at all
  // times, on every screen, when the overwhelming majority of them will never be
  // party to a proceeding. It reads as an accusation waiting to happen.
  //
  // THE HALF THAT CANNOT BE LOST WITH IT. An Explorer summoned to a case is the
  // person in it with the least standing, and their answer has to be reachable
  // without anybody telling them where to look -- they can post even while
  // suspended, because suspending somebody pending a hearing must not take away
  // their side of it. Deleting the door and stopping there would have quietly
  // removed that. So Settings carries an Admin Reports folder for EVERY role,
  // and tests/a-case-is-reachable-by-whoever-is-in-it.mjs fails the build if it
  // ever stops being reachable for the people a case is about.
  ...(role === 'admin' || role === 'executive'
    ? [{ href: '/cases', icon: '⚖️', label: 'Admin Reports' }]
    : []),
  ...(role === 'admin' || role === 'executive'
    ? [{ href: '/mail', icon: '✉️', label: 'Mail' }]
    : []),
  { href: '/profile',  icon: '🙂', label: 'Profile' },
  { href: '/settings', icon: '⚙️', label: 'Settings' },
];

function ShellLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="tap-sm grid shrink-0 place-items-center gap-1 rounded-full bg-white/10 px-2.5 hover:bg-white/20 lg:flex lg:px-3"
    >
      <span aria-hidden>{icon}</span>
      <span className="hidden text-sm font-semibold lg:inline">{label}</span>
    </Link>
  );
}

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
  // along — LeftRail, RightRail, the themes, the note, the ambient player.
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

  // `{}` meant mail: undefined, which the rail reads as "not true" only by
  // accident of the default. Said explicitly, and for the same reason as
  // SECTIONS above: /mail is the Invitations screen, and a Guide or an
  // Explorer opening it got a card explaining there was nothing there.
  const leadsChurch = profile.role === 'admin' || profile.role === 'executive';
  const groups = railGroupsFor(profile.role, {}, { mail: leadsChurch });

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
        className="sticky z-20 text-white shadow-md"
        /* Sticks BELOW the tutorial bar when there is one. See AppShell. */
        style={{ backgroundColor: NAVY, top: 'var(--beacon-chrome-top, 0px)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-3 sm:px-4">
          <Link
            href={homeFor(profile.role)}
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

          <div className="hidden min-w-0 text-right sm:block">
            <p className="max-w-48 truncate text-sm font-semibold">{profile.full_name}</p>
            <p className="text-xs text-white/60">{roleLabel(profile.role, profile.role)}</p>
          </div>
          <Avatar name={profile.full_name || session.user.email || 'Member'} size={36} onDark />
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

        {/* THE ROOM LINKS, ON THEIR OWN ROW, BELOW `xl`.
            //
            All of this used to be one row. On a 390px iPhone that row needed
            about 600px — six 44px controls, an avatar, and a "Sign out" button,
            almost all of them `shrink-0` — so it ran off the side and took the
            whole page with it. What an iOS user saw was a tall empty strip down
            the right of every screen: the page had become wider than the phone,
            and that strip was the empty part of it.

            It scrolls inside itself (`overflow-x-auto`) rather than pushing the
            page, so even a longer list of sections can never do this again. At
            `xl`, the left room rail appears and this duplicate row disappears.

            HOME IS FIRST, and it is new. The header logo has always linked
            home, but a logo does not read as a button to somebody who has never
            used the app — several people had no way back to where they started
            and no reason to think the picture was one. */}
        <nav
          className="thin-scroll mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-3 pb-2 sm:px-4 xl:hidden"
          aria-label="Sections"
        >
          <ShellLink href={homeFor(profile.role)} icon="🏠" label="Home" />
          {SECTIONS(profile.role).map((s) => (
            <ShellLink key={s.href} href={s.href} icon={s.icon} label={s.label} />
          ))}
        </nav>
      </header>

      {/* Three columns from xl up, one column below it — the same breakpoint
          the sample-data shell uses, so a phone and a tablet get the identical
          layout there and here. The rails hide themselves; nothing about the
          page underneath changes. */}
      <div className="mx-auto flex max-w-[1600px] flex-col items-stretch gap-6 px-4 xl:flex-row xl:items-start">
        {room.prefs.leftRail && <LeftRail groups={groups} theme={room.theme} />}

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
        )}
      </div>

      <footer className="border-t border-black/5 py-5 text-center text-xs text-gray-400">
        Invitation-only. Access is enforced by the church database.
      </footer>
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

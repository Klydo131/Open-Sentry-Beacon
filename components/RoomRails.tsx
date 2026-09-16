'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Role } from '@/lib/types';
import { roleLabel } from '@/lib/brand';
import { useRoom, type RoomTheme, type RoomPrefs, inkOn } from '@/lib/room-theme';
import { PlayerStrip } from '@/components/PlayerBar';
import { Pocket } from '@/components/Pocket';

// -------------------------------------------------------------------------
// The room rails — the workspace either side of the page on a wide screen.
//
// The brief, in one line: a Digital Seeker's room is a place to STUDY, not a
// place to be seen. There is no feed here, no follower count, no activity of
// other people. It is a desk, a lamp, a timer and a line they wrote for
// themselves. Everything about it is private and lives on their own device.
//
// Staff rooms are the same idea pointed at a different job. An admin
// member and a missionary all have people waiting on them, so their rail leads
// with the work: what is on the desk today, and one tap to each place they go.
// Same customisation, different furniture.
//
// THE LEFT RAIL IS DESKTOP ONLY (`xl` and up); below that the shells draw a
// horizontal section strip instead, so navigation still reaches everywhere.
// THE RIGHT RAIL IS NOT. It used to be, and everything personal in it -- the
// study timer, the theme, the line you write for yourself -- was therefore
// missing on every phone and tablet. It now stacks under the main column below
// `xl` rather than hiding, so the room belongs to its owner at any width.
//
// Nothing here touches a backend. Counts arrive as props so this file can be
// used by the demo shell and the live shell without pulling a database client
// into either bundle.
// -------------------------------------------------------------------------

export interface RailLink {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  /**
   * Still being built, and said so where somebody decides whether to open it.
   *
   * A CHIP RATHER THAN "(Still on Beta)" AFTER THE NAME. The label is
   * `truncate` inside a narrow rail, so "Guild Room (Still on Beta)" renders as
   * "Guild Room (Still on…" — the warning is the half that gets cut. The chip
   * cannot be truncated away, and the full phrase is on the link's title and
   * its accessible name for anybody hovering or listening.
   */
  beta?: boolean;
}

export interface RailGroup {
  title: string;
  links: RailLink[];
}

// What each role sees, and in what order. The first group is the job; the last
// is always the person themselves.
export function railGroupsFor(
  role: Role,
  counts: {
    mail?: number;
    approvals?: number;
    seekers?: number;
    /** Unread release notes, or 1 when an update is waiting to be applied. */
    updates?: number;
  } = {},
  // The simulated mailbox is a demo-only screen; the live site has no /mail
  // route, and a rail link to a 404 is worse than no link.
  opts: { mail?: boolean } = { mail: true },
): RailGroup[] {
  const personal: RailGroup = {
    title: 'You',
    links: [
      { href: '/profile', label: 'Profile', icon: '🪪' },
      ...(opts.mail
        ? [{ href: '/mail', label: 'Mail', icon: '✉️', badge: counts.mail }]
        : []),
      // TUTORIAL, WHAT'S NEW AND FEEDBACK LIVE IN SETTINGS, not out here.
      //
      // They were rail entries for a while, put there because each had been
      // reported as missing when it was only reachable by scrolling Settings.
      // That fixed the wrong half: it made the rail six items long for three
      // things somebody uses once a month, and the rail is the thing people
      // look at all day. They are cards in Settings, which is one tap away and
      // is where a person already looks for the occasional thing.
      //
      // The unread badge moves onto Settings itself, so a release nobody has
      // read is still visible from every screen without costing a whole row.
      { href: '/settings', label: 'Settings', icon: '⚙️', badge: counts.updates },
    ],
  };

  // The church home leads every rail. The billboard is where a person catches
  // up on the whole church before dropping into their own desk, so it sits at
  // the very top, ahead of the role dashboard and the resources shelf.
  const home = { href: '/church', label: 'Home', icon: '🏠' };

  // CASES ARE A ROOM, FOR EVERY ROLE, AND ALWAYS PRESENT.
  //
  // A case used to be a card partway down a dashboard, which is easy to scroll
  // past on the one day it matters and puts a formal hearing in the same visual
  // rank as a study plan. It is also the screen an Explorer most needs to be
  // able to find without being told, because an Explorer called into a case is
  // the person in it with the least standing.
  //
  // The link does not appear and disappear with the caseload. A rail entry that
  // comes and goes is one nobody trusts is there, and its absence on a quiet
  // day is indistinguishable from it being broken. The room says plainly that
  // nothing is open.
  // Leadership only, and renamed. A Guide or an Explorer reaches a case they
  // are party to through Settings -> Admin Reports; see LiveAppShell.
  const cases = { href: '/cases', label: 'Admin Reports', icon: '⚖️', beta: true };

  // THE OFFICE, for everybody who has work to do in this app rather than a
  // journey to walk. The tools were scattered through the screens that are
  // about people, which made those screens long and the tools hard to find.
  // Explorers do not get it: none of it is theirs to do, and an empty room
  // tells somebody they are missing something.
  const office = { href: '/office', label: 'Office', icon: '🗂️' };

  // MY FILES, AND IT USED TO BE CALLED RESOURCES.
  //
  // Three screens in this app were called Resources and only two of them hold
  // anything somebody handed you: the church shelf inside the Office, and the
  // Resources tab on one Explorer's page, which is where sharing lands. This
  // door is neither. It opens a person's OWN media, saved on their own device,
  // with playlists and favourites -- nothing shared, nothing from anybody else.
  //
  // A Guide looking for what their Explorer had sent them came here first,
  // reasonably, and found their own files. The room was not wrong; its name
  // was. It also had two names for the same page -- an Explorer saw "My
  // Library" and everybody else saw "Resources" -- so a Guide reading an
  // Explorer's screen over their shoulder saw a room they did not have.
  const myFiles = { href: '/library', label: 'My Files', icon: '📚' };

  // PUBLISH, for every role. Writing was scattered across the screens people
  // READ: the blog desk on an Explorer's journey, on a Guide's Office and in a
  // Director's admin tab, and the announcement composer on top of the church
  // home screen. Publishing is a task, and a task gets a room.
  const publish = { href: '/publish', label: 'Publish', icon: '✍️', beta: true };
  // The Guild Room is archived. Its rail entries are gone with its nav entry;
  // see the note in LiveAppShell. Nothing in the database was touched.

  if (role === 'ds') {
    return [
      {
        title: 'My Rooms',
        links: [
          home,
          { href: '/ds', label: 'My Journey', icon: '🎯' },
          myFiles,
          publish,
        ],
      },
      personal,
    ];
  }

  if (role === 'dm') {
    return [
      {
        title: 'My Rooms',
        links: [
          home,
          { href: '/dm', label: 'My Explorers', icon: '🤝', badge: counts.seekers },
          office,
          publish,
          myFiles,
        ],
      },
      personal,
    ];
  }

  // admin + executive
  return [
    {
      title: 'My Rooms',
      links: [
        home,
        { href: '/admin', label: 'Admin', icon: '🛡️', badge: counts.approvals },
        office,
        publish,
        myFiles,
        cases,
      ],
    },
    personal,
  ];
}

// ---------------------------------------------------------------- left rail

export function LeftRail({
  groups,
  theme,
}: {
  groups: RailGroup[];
  theme: RoomTheme;
}) {
  const path = usePathname();

  return (
    <nav
      aria-label="Workspace"
      className="compact-ui thin-scroll sticky top-[76px] hidden max-h-[calc(100vh-96px)] w-56 shrink-0 overflow-y-auto pb-6 [max-height:calc(100dvh-96px)] xl:block"
    >
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.title}>
            <p
              className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: theme.inkSoft }}
            >
              {g.title}
            </p>
            <div className="space-y-0.5">
              {g.links.map((l) => {
                const on = path === l.href || path.startsWith(`${l.href}/`);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    aria-current={on ? 'page' : undefined}
                    // The chip reads "Beta"; the whole sentence lives here, so
                    // hovering or listening gives the warning in full rather
                    // than one word somebody has to interpret.
                    title={l.beta ? `${l.label}, still on beta` : undefined}
                    aria-label={l.beta ? `${l.label}, still on beta` : undefined}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold"
                    style={{
                      backgroundColor: on ? theme.accent : 'transparent',
                      // Not always white: four palettes have an accent light
                      // enough that white on it is unreadable, and the
                      // selected item is the page you are already on.
                      color: on ? inkOn(theme.accent) : theme.ink,
                    }}
                  >
                    <span aria-hidden className="text-base">
                      {l.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{l.label}</span>
                    {l.beta && (
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        style={{
                          backgroundColor: on ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.07)',
                          color: on ? inkOn(theme.accent) : theme.inkSoft,
                        }}
                      >
                        Beta
                      </span>
                    )}
                    {!!l.badge && (
                      <span
                        className="grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold"
                        style={{
                          backgroundColor: on ? 'rgba(255,255,255,0.25)' : theme.accent,
                          color: on ? inkOn(theme.accent) : inkOn(theme.accent),
                        }}
                      >
                        {l.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}

// --------------------------------------------------------------- right rail

export function RightRail({
  role,
  name,
  theme,
  themes,
  prefs,
  update,
  today,
  desk,
}: {
  role: Role;
  name: string;
  theme: RoomTheme;
  themes: RoomTheme[];
  prefs: RoomPrefs;
  update: (p: Partial<RoomPrefs>) => void;
  today?: { label: string; value: string }[];
  /**
   * Replaces the desk card entirely.
   *
   * The live shell passes a real one that loads what is coming up and what is
   * waiting; the tutorial keeps the simple list of numbers. Passing the whole
   * card rather than its data keeps this file free of every live query.
   */
  desk?: React.ReactNode;
}) {
  const seeker = role === 'ds';

  // NOT HIDDEN ANY MORE, AND NOT DUPLICATED EITHER.
  //
  // This was `hidden ... xl:block`, so everything in it died below 1280px: an
  // iPad Pro is 1024 across and a phone is 375, which is every device an
  // Explorer actually owns. What died with it was the study timer and the whole
  // "make it mine" surface -- the theme picker and the line you write for
  // yourself -- neither of which Settings offers, so below 1280px they were not
  // merely awkward to reach, they were gone.
  //
  // The pocket was rescued from this last week by rendering a SECOND copy in
  // the main column at `xl:hidden`. That works for the pocket, which only reads
  // rows, and would be wrong for what sits beside it: FocusTimer owns a
  // setInterval, so two copies is two timers, the hidden one still counting,
  // and a study that reads 25:00 after somebody rotates their tablet.
  //
  // So the rail MOVES instead of being copied. Below xl it is an ordinary
  // full-width block falling under the main column, because the parent stacks
  // there; from xl it is the sticky 288px column it always was. One instance,
  // one timer, every width.
  return (
    <aside
      aria-label={seeker ? 'My room' : 'My office'}
      className="compact-ui thin-scroll w-full space-y-3 pb-6 xl:sticky xl:top-[76px] xl:max-h-[calc(100vh-96px)] xl:w-72 xl:shrink-0 xl:overflow-y-auto xl:[max-height:calc(100dvh-96px)]"
    >
      <RoomCard
        seeker={seeker}
        role={role}
        name={name}
        theme={theme}
        themes={themes}
        prefs={prefs}
        update={update}
      />

      {/* AN EXPLORER GETS THE TIMER, EVERYBODY ELSE GETS THE DESK, and that
          split is deliberate: an Explorer has no queue of work, and giving them
          a "waiting for you" panel would invent one. The desk is passed in when
          the caller has a real one; the tutorial keeps the simple list. */}
      {seeker ? <FocusTimer theme={theme} /> : (desk ?? <TodayCard theme={theme} today={today} />)}

      {/* THE POCKET SITS BETWEEN THE DESK AND THE PLAYER, which is exactly
          where it was asked for, with the gap circled in red. It is a bridge to
          the web apps somebody already uses -- Spotify, YouTube, the office
          suite -- so it belongs with the other things that are open while you
          work, not in a room of its own. Every role gets it: "that can be
          helpful to ALL users". */}
      <Pocket theme={theme} />

      {/* THE PLAYER LIVES IN THE RAIL, on every room, because that is the
          point of it: something quiet in the background while you work. The
          audio element is above both this and the library's full player, so
          moving between rooms never cuts it off. */}
      <PlayerStrip theme={theme} />

    </aside>
  );
}

function RoomCard({
  seeker,
  role,
  name,
  theme,
  themes,
  prefs,
  update,
}: {
  seeker: boolean;
  role: Role;
  name: string;
  theme: RoomTheme;
  themes: RoomTheme[];
  prefs: RoomPrefs;
  update: (p: Partial<RoomPrefs>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(prefs.motto);

  useEffect(() => setDraft(prefs.motto), [prefs.motto]);

  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: theme.panel, border: `1px solid ${theme.line}` }}
    >
      <p
        className="text-[11px] font-bold uppercase tracking-wider"
        style={{ color: theme.inkSoft }}
      >
        {seeker ? 'My room' : 'My office'}
      </p>
      <p className="mt-0.5 truncate text-base font-extrabold" style={{ color: theme.ink }}>
        {name}
      </p>
      {roleLabel(role, role) && (
        <p className="text-xs" style={{ color: theme.inkSoft }}>
          {roleLabel(role, role)}
        </p>
      )}

      {/* A line you write for yourself. Nobody else ever sees it — it is not
          a status, it is a note on your own desk. */}
      <div className="mt-3">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 80))}
              rows={2}
              autoFocus
              placeholder={
                seeker ? 'A verse, or why you started…' : 'What matters this week…'
              }
              className="w-full min-w-0 resize-none rounded-lg px-2 py-1.5 text-sm outline-none"
              style={{
                backgroundColor: 'transparent',
                color: theme.ink,
                border: `1px solid ${theme.line}`,
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  update({ motto: draft.trim() });
                  setEditing(false);
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                style={{ backgroundColor: theme.accent }}
              >
                Save
              </button>
              <button
                onClick={() => {
                  setDraft(prefs.motto);
                  setEditing(false);
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{ color: theme.inkSoft }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="w-full rounded-lg px-2 py-1.5 text-left text-sm italic"
            style={{
              color: prefs.motto ? theme.ink : theme.inkSoft,
              border: `1px dashed ${theme.line}`,
            }}
          >
            {prefs.motto || (seeker ? '＋ Add a line for yourself' : '＋ Add a note')}
          </button>
        )}
      </div>

      {/* Theme picker — the actual "make it mine" control. */}
      <p
        className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wider"
        style={{ color: theme.inkSoft }}
      >
        {seeker ? 'Room' : 'Office'}
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {themes.map((t) => {
          const on = t.key === prefs.theme;
          return (
            <button
              key={t.key}
              onClick={() => update({ theme: t.key })}
              title={`${t.label} · ${t.blurb}`}
              aria-label={t.label}
              aria-pressed={on}
              className="h-8 rounded-lg"
              style={{
                background: t.bg,
                border: on ? `2px solid ${theme.accent}` : `1px solid ${theme.line}`,
                boxShadow: on ? `0 0 0 2px ${theme.panel}` : undefined,
              }}
            />
          );
        })}
      </div>
      <p className="mt-1.5 text-xs" style={{ color: theme.inkSoft }}>
        {theme.label} · {theme.blurb}
      </p>
    </div>
  );
}

// A study timer. The one thing a private study room needs that a feed never
// gives you: a defined stretch of undisturbed time.
function FocusTimer({ theme }: { theme: RoomTheme }) {
  const PRESETS = [15, 25, 45];
  const [mins, setMins] = useState(25);
  const [left, setLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    tick.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          setRunning(false);
          setDone(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [running]);

  const set = (m: number) => {
    setMins(m);
    setLeft(m * 60);
    setRunning(false);
    setDone(false);
  };

  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const pct = mins > 0 ? ((mins * 60 - left) / (mins * 60)) * 100 : 0;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: theme.panel, border: `1px solid ${theme.line}` }}
    >
      <p
        className="text-[11px] font-bold uppercase tracking-wider"
        style={{ color: theme.inkSoft }}
      >
        Study time
      </p>

      <p
        className="mt-1 text-center text-4xl font-extrabold tabular-nums"
        style={{ color: done ? theme.accent : theme.ink }}
        aria-live="polite"
      >
        {mm}:{ss}
      </p>

      <div
        className="mt-2 h-1 overflow-hidden rounded-full"
        style={{ backgroundColor: theme.line }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%`, backgroundColor: theme.accent }}
        />
      </div>

      {done ? (
        <p className="mt-2 text-center text-sm font-semibold" style={{ color: theme.accent }}>
          ✓ Well done. Time's up.
        </p>
      ) : null}

      <div className="mt-3 flex gap-1.5">
        {PRESETS.map((m) => (
          <button
            key={m}
            onClick={() => set(m)}
            className="flex-1 rounded-lg py-1.5 text-xs font-semibold"
            style={{
              backgroundColor: m === mins ? theme.accent : 'transparent',
              color: m === mins ? '#fff' : theme.inkSoft,
              border: `1px solid ${m === mins ? theme.accent : theme.line}`,
            }}
          >
            {m}m
          </button>
        ))}
      </div>

      <div className="mt-2 flex gap-1.5">
        <button
          onClick={() => {
            setDone(false);
            setRunning((r) => !r);
          }}
          disabled={left === 0}
          className="flex-1 rounded-lg py-2 text-sm font-bold text-white disabled:opacity-40"
          style={{ backgroundColor: theme.accent }}
        >
          {running ? 'Pause' : 'Start'}
        </button>
        <button
          onClick={() => set(mins)}
          className="rounded-lg px-3 py-2 text-sm font-semibold"
          style={{ color: theme.inkSoft, border: `1px solid ${theme.line}` }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// The staff equivalent: what is on the desk right now.
function TodayCard({
  theme,
  today,
}: {
  theme: RoomTheme;
  today?: { label: string; value: string }[];
}) {
  const now = new Date();
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: theme.panel, border: `1px solid ${theme.line}` }}
    >
      <p
        className="text-[11px] font-bold uppercase tracking-wider"
        style={{ color: theme.inkSoft }}
      >
        On the desk
      </p>
      <p className="mt-0.5 text-sm font-bold" style={{ color: theme.ink }}>
        {now.toLocaleDateString([], {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      </p>

      {today && today.length > 0 ? (
        <div className="mt-3 space-y-2">
          {today.map((t) => (
            <div key={t.label} className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm" style={{ color: theme.inkSoft }}>
                {t.label}
              </span>
              <span className="text-lg font-extrabold" style={{ color: theme.ink }}>
                {t.value}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm" style={{ color: theme.inkSoft }}>
          Nothing waiting. A good place to be.
        </p>
      )}
    </div>
  );
}

export { useRoom };

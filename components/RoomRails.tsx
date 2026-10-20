'use client';

import { useEffect, useRef, useState } from 'react';
import type { Role } from '@/lib/types';
import { roleLabel } from '@/lib/brand';
import { useRoom, type RoomTheme, type RoomPrefs } from '@/lib/room-theme';
import { PlayerStrip } from '@/components/PlayerBar';
import { Pocket } from '@/components/Pocket';

// The room rails. railGroupsFor lists each role's rooms, which the Menu draws.
// RightRail is the personal desk (timer or work desk, pocket, player, a note
// to yourself, theme); it stacks under the page below `xl`. Counts arrive as
// props, so no database client is pulled into either shell's bundle.

export interface RailLink {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  /** Still in beta: shown as a chip, which cannot be truncated away like a suffix. */
  beta?: boolean;
}

export interface RailGroup {
  title: string;
  links: RailLink[];
}

// What each role sees, in order: the job first, the person last.
export function railGroupsFor(
  role: Role,
  counts: {
    mail?: number;
    approvals?: number;
    seekers?: number;
    /** Unread release notes, or 1 when an update is waiting to be applied. */
    updates?: number;
  } = {},
  // The mail screen exists only in the sample church.
  opts: { mail?: boolean } = { mail: true },
): RailGroup[] {
  const personal: RailGroup = {
    title: 'You',
    links: [
      { href: '/profile', label: 'Profile', icon: '🪪' },
      ...(opts.mail
        ? [{ href: '/mail', label: 'Mail', icon: '✉️', badge: counts.mail }]
        : []),
      // Tutorial, What's New and Feedback live in Settings; the unread badge sits on Settings.
      { href: '/settings', label: 'Settings', icon: '⚙️', badge: counts.updates },
    ],
  };

  // Home leads every role's list.
  const home = { href: '/church', label: 'Home', icon: '🏠' };

  // Cases (Admin Reports): a room for leadership. Guides and Explorers reach
  // their own cases through Settings.
  const cases = { href: '/cases', label: 'Admin Reports', icon: '⚖️', beta: true };

  // The Office, for everyone but Explorers.
  const office = { href: '/office', label: 'Office', icon: '🗂️' };

  // My Files: the person's own media on their device. Nothing shared lands here.
  const myFiles = { href: '/library', label: 'My Files', icon: '📚' };

  // The Study Room, for Explorers; marked beta.
  const studyRoom = { href: '/study', label: 'Study Room', icon: '📖', beta: true };

  // This Sabbath: the church's shared program, readable offline.
  const thisSabbath = { href: '/sabbath', label: 'This Sabbath', icon: '🗓️' };

  // Music: player, playlists, tuner, conductor and pieces.
  const music = { href: '/music', label: 'Music', icon: '🎵' };

  if (role === 'ds') {
    return [
      {
        title: 'My Rooms',
        links: [
          home,
          { href: '/ds', label: 'My Journey', icon: '🎯' },
          thisSabbath,
          studyRoom,
          music,
          myFiles,
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
          thisSabbath,
          music,
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
        thisSabbath,
        music,
        myFiles,
        cases,
      ],
    },
    personal,
  ];
}

// The Menu draws these groups; there is no separate left rail.

// --- Right rail ---

export function RightRail({
  role,
  name,
  theme,
  themes,
  prefs,
  update,
  chosen,
  choose,
  today,
  desk,
}: {
  role: Role;
  name: string;
  theme: RoomTheme;
  themes: RoomTheme[];
  prefs: RoomPrefs;
  update: (p: Partial<RoomPrefs>) => void;
  /** The swatch that is on: Classic's palette, or under another look, that look's choice. */
  chosen: string;
  choose: (key: string) => void;
  today?: { label: string; value: string }[];
  /** Replaces the desk card: the live shell passes its own; the tutorial uses the simple list. */
  desk?: React.ReactNode;
}) {
  const seeker = role === 'ds';

  // One instance at every width: below xl it stacks under the page (with the deep
  // bottom padding the floating controls need); from xl it is a sticky column
  // sized in globals.css (.desk-rail). Never duplicate it: FocusTimer owns a timer.
  return (
    <aside
      aria-label={seeker ? 'My room' : 'My office'}
      className="desk-rail compact-ui thin-scroll w-full space-y-3 pb-28 xl:sticky xl:w-72 xl:shrink-0 xl:overflow-y-auto"
    >
      <RoomCard
        seeker={seeker}
        role={role}
        name={name}
        theme={theme}
        themes={themes}
        prefs={prefs}
        update={update}
        chosen={chosen}
        choose={choose}
      />

      {/* An Explorer gets the study timer; everyone else gets the desk. */}
      {seeker ? <FocusTimer theme={theme} /> : (desk ?? <TodayCard theme={theme} today={today} />)}

      {/* The pocket: shortcuts to the web apps somebody already uses. */}
      <Pocket theme={theme} />

      {/* The player strip; the audio element lives above every room, so it never stops on navigation. */}
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
  chosen,
  choose,
}: {
  seeker: boolean;
  role: Role;
  name: string;
  theme: RoomTheme;
  themes: RoomTheme[];
  prefs: RoomPrefs;
  update: (p: Partial<RoomPrefs>) => void;
  chosen: string;
  choose: (key: string) => void;
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

      {/* A private note to yourself. */}
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

      {/* Theme picker. */}
      <p
        className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wider"
        style={{ color: theme.inkSoft }}
      >
        {seeker ? 'Room' : 'Office'}
      </p>
      {/* Under another look, the first swatch is that look's colours (lib/room-theme.ts). */}
      <div className={`grid ${themes.length > 5 ? 'grid-cols-6' : 'grid-cols-5'} gap-1.5`} data-room-palettes>
        {themes.map((t) => {
          const on = t.key === chosen;
          return (
            <button
              key={t.key}
              onClick={() => choose(t.key)}
              title={`${t.label} · ${t.blurb}`}
              aria-label={t.label}
              aria-pressed={on}
              data-room-palette={t.key}
              className="h-8 rounded-lg"
              style={{
                background: t.swatch ?? t.bg,
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

// A study timer.
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

// The staff desk: what needs attention today.
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

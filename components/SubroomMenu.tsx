'use client';

// Every sub-room of a room, in one drop-down, on every device.
//
// ---------------------------------------------------------------------------
// ASKED FOR ON 30 SEPTEMBER 2026, with a screenshot of a Guide's home: "I want
// all sub-rooms to be drop down list or some kind of drop down for users to see
// all sub-rooms optimally in all devices. I realized users get confused that
// they need to slide sub-rooms and request a drop down feature instead to see
// all sub-rooms in a room like most modern websites do."
//
// The strip it replaces scrolled sideways inside its own box, so on a phone
// the rooms past the edge of the screen were simply not there for anybody who
// did not know to swipe. A list that opens shows every one of them at once.
//
// WHAT THE OLD STRIP GOT RIGHT IS KEPT ON THE CLOSED BUTTON. Rooms.tsx used to
// explain why it was not a drop-down: a closed menu hides how many rooms there
// are, and whether something is waiting in one you are not in. So the button
// says both -- "2 of 4", and a red count when something that needs doing is in
// another room -- and the question of whether to open it answers itself.
//
// ONE COMPONENT FOR ALL THREE STRIPS: the sub-rooms of a room (RoomTabs), the
// tabs on one person's page (Tabs, in ui.tsx) and the mailbox. They were one
// shape on screen, so they are one shape in the code, on both halves of the
// app.
// ---------------------------------------------------------------------------

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronGlyph, CheckGlyph } from '@/components/Glyph';
import { fadeInAfter } from '@/lib/motion';

export interface SubroomItem {
  id: string;
  /** The words, with any emoji the room already carried. */
  label: React.ReactNode;
  /** Plain text, for the screen reader and the "2 of 4" button. */
  text: string;
  icon?: string;
  badge?: number;
  /**
   * What the count means. `urgent`, red: things to clear. `waiting`, gold:
   * something there for you, as the tabs on a person's page always drew it.
   * Neither: a plain total. "3 waiting" and "3 members" must never look alike.
   */
  tone?: 'urgent' | 'waiting';
  /** What the tutorial and the walks point at: `room-x` or `tab-x`. */
  quest?: string;
  /** `data-room` on a sub-room, which the walks and the desk links read. */
  room?: string;
}

function badgeTone(tone: SubroomItem['tone'], onDark: boolean): string {
  if (tone === 'urgent') return 'bg-red-500 text-white';
  if (tone === 'waiting') return 'bg-gold text-navy';
  return onDark ? 'bg-white/20 text-white' : 'bg-navy/10 text-navy';
}

export function SubroomMenu({
  items,
  active,
  onChoose,
  label,
  quest,
}: {
  items: SubroomItem[];
  active: string;
  onChoose: (id: string) => void;
  /** What these are, for a screen reader: "Rooms", "Sections". */
  label: string;
  /**
   * What the tutorial calls the closed button: `rooms-menu` for the sub-rooms
   * of a room, `sections-menu` for the tabs on one person's page. Two names,
   * so a step about a person's Journey tab can never point at the room list
   * of the page before it.
   */
  quest: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const index = Math.max(0, items.findIndex((i) => i.id === active));
  const current = items[index];
  // WHAT IS WAITING ELSEWHERE, on the closed button: the one thing a strip
  // showed at a glance that a closed menu would otherwise hide.
  const elsewhere = items.filter((i) => i.id !== current?.id && i.tone && (i.badge ?? 0) > 0);
  const waitingElsewhere = elsewhere.reduce((sum, i) => sum + (i.badge ?? 0), 0);
  const urgentElsewhere = elsewhere.some((i) => i.tone === 'urgent');

  // Outside, Escape, or choosing closes it. Escape hands focus back to the
  // button, so a keyboard is never left somewhere that has vanished.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); }
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  // Opening puts the keyboard on the room you are in, and the arrows move it.
  useEffect(() => {
    if (!open) return;
    const selected = wrap.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    selected?.focus({ preventScroll: true });
  }, [open]);

  const onListKey = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const options = [...(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    const at = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown'
      ? options[Math.min(options.length - 1, at + 1)]
      : options[Math.max(0, at - 1)];
    next?.focus();
  };

  if (!current) return null;

  return (
    <div ref={wrap} className="no-print relative sm:inline-block" data-subroom-menu>
      <button
        ref={toggle}
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label}: ${current.text}, ${index + 1} of ${items.length}. Show all`}
        data-subroom-toggle
        data-quest={quest}
        className="tap flex w-full items-center gap-2 rounded-2xl bg-navy px-4 text-left font-bold text-white shadow transition-transform active:scale-[0.99] sm:w-auto sm:min-w-[18rem]"
      >
        {current.icon && <span aria-hidden className="text-lg">{current.icon}</span>}
        <span className="min-w-0 flex-1 truncate">{current.label}</span>
        {typeof current.badge === 'number' && current.badge > 0 && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${badgeTone(current.tone, true)}`}>
            {current.badge}
          </span>
        )}
        <span className="shrink-0 text-xs font-semibold text-white/70">
          {index + 1} of {items.length}
        </span>
        {waitingElsewhere > 0 && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
              urgentElsewhere ? 'bg-red-500 text-white' : 'bg-gold text-navy'}`}
            title={`${waitingElsewhere} waiting in another room`}
          >
            {waitingElsewhere}
          </span>
        )}
        <ChevronGlyph open size={18} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* AS WIDE AS ITS OWN BUTTON, at every size. The button is in the page,
          so the list cannot run off the edge of the screen: no fixed width to
          clamp (tests/overlays-on-a-phone.mjs). `dvh` after `vh`: the part of
          the screen a phone is actually showing. */}
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          onKeyDown={onListKey}
          className="subroom-menu-in absolute left-0 right-0 z-40 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl bg-white p-1.5 ring-1 ring-black/10 lift-3 [max-height:70dvh]"
        >
          {items.map((item) => {
            const on = item.id === current.id;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={on}
                data-room={item.room}
                data-quest={item.quest}
                onClick={() => {
                  onChoose(item.id);
                  setOpen(false);
                  toggle.current?.focus();
                  // THE NEW ROOM FADES IN where the old one was, instead of
                  // swapping in a single frame. A frame later, so it is the new
                  // room that fades and not the one that is leaving.
                  const from = wrap.current;
                  if (!on) requestAnimationFrame(() => fadeInAfter(from));
                }}
                className={`tap flex w-full items-center gap-3 rounded-xl px-3 text-left font-bold transition-colors ${
                  on ? 'bg-navy/[0.07] text-navy' : 'text-navy hover:bg-black/[0.04]'}`}
              >
                {item.icon && <span aria-hidden className="text-lg">{item.icon}</span>}
                <span className="min-w-0 flex-1">{item.label}</span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  // "3 waiting" and "3 members" must never look the same.
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${badgeTone(item.tone, false)}`}>
                    {item.badge}
                  </span>
                )}
                {on && <CheckGlyph size={18} className="shrink-0 text-navy" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

// What you can do with one message: react, reply, copy, change or take back.
//
// ---------------------------------------------------------------------------
// ONE MENU, OPENED THE WAY EVERY MESSAGING APP OPENS IT. Hold a message on a
// phone, right-click it on a computer, or press the small ⋯ beside it (which a
// keyboard reaches too). It used to be two underlined links -- Edit, Delete --
// inside every message you had ever sent, which made each of your bubbles two
// lines taller and put a red word in the middle of the conversation. Asked for
// on 1 October 2026 with a screenshot of exactly that.
//
// A SHEET FROM THE BOTTOM OF THE CONVERSATION, at every size. On a phone that
// is where the thumb is; in the desktop panel it is the same panel. The
// message it is about is lit where it sits AND quoted at the top of the sheet:
// lifting the bubble above the dimmed thread put it on top of the reactions
// whenever it sat low on the screen (seen in the first screenshot), and a
// quote is never in the way.
//
// TAKING BACK ASKS FIRST, in the same sheet, and says what the other person
// will see. A message is never silently gone: the thread says it was deleted
// (components/talk/ChatView.tsx).
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { CopyGlyph, DownloadGlyph, PencilGlyph, ReplyGlyph, TrashGlyph } from '@/components/Glyph';
import { REACTIONS } from '@/lib/talk/reactions';

export interface MenuAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  run: () => void;
  /** Red, and asks before it acts. */
  danger?: { confirm: string; detail: string };
}

export function MessageMenu({
  title,
  mine,
  preview,
  myReaction,
  canReact,
  actions,
  busy,
  onReact,
  onClose,
}: {
  /** What the menu is about, for a screen reader: "Your message", "Ana's photo". */
  title: string;
  mine: boolean;
  /** The words (or "Photo", "Voice message"), so it is plain which message. */
  preview: string;
  myReaction: string | null;
  canReact: boolean;
  actions: MenuAction[];
  busy?: boolean;
  onReact: (emoji: string | null) => void;
  onClose: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState<MenuAction | null>(null);

  useEffect(() => {
    first.current?.focus({ preventScroll: true });
    // FIRST, AND ONLY HERE. Caught on the way down (capture, on window) and
    // stopped, so the chat panel's own Escape does not close the conversation
    // along with the menu.
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col justify-end bg-slate-900/25"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      data-message-menu
    >
      <div
        role="dialog"
        aria-label={`Options for ${title}`}
        className="menu-sheet-in mx-auto w-full max-w-md rounded-t-[28px] solid-panel bg-white px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-2 lift-3"
      >
        <span aria-hidden className="mx-auto mb-2 block h-1 w-10 rounded-full bg-slate-200" />
        <p className={`mb-2 line-clamp-2 rounded-2xl px-3 py-2 text-[0.778rem] leading-snug text-slate-700 ${
          mine ? 'bg-[#E4F0F5]' : 'bg-[#FCEEDF]'}`} data-menu-preview>
          {preview}
        </p>

        {confirming?.danger ? (
          <div className="px-2 pb-1 pt-1">
            <p className="text-[0.944rem] font-extrabold text-navy">{confirming.danger.confirm}</p>
            <p className="mt-1 text-[0.778rem] leading-snug text-slate-600">{confirming.danger.detail}</p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                ref={first}
                type="button"
                disabled={busy}
                onClick={() => confirming.run()}
                className="tap w-full rounded-2xl bg-red-600 px-4 font-bold text-white disabled:opacity-60"
                data-menu-confirm
              >
                {busy ? 'Working…' : confirming.label}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="tap w-full rounded-2xl bg-slate-100 px-4 font-bold text-navy"
              >
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <>
            {canReact && (
              // THE SIX, one tap each. Tapping the one you already chose takes
              // it away, as it does everywhere else.
              <div role="group" aria-label="React" className="mb-2 flex items-center justify-between gap-1 rounded-full bg-slate-50 px-1.5 py-1 ring-1 ring-black/5">
                {REACTIONS.map((r, i) => {
                  const on = myReaction === r.emoji;
                  return (
                    <button
                      key={r.emoji}
                      ref={i === 0 ? first : undefined}
                      type="button"
                      aria-label={on ? `Take away ${r.label}` : `React ${r.label}`}
                      aria-pressed={on}
                      onClick={() => onReact(on ? null : r.emoji)}
                      className={`grid h-12 min-h-0 w-12 place-items-center rounded-full text-[1.444rem] leading-none transition-transform active:scale-90 ${
                        on ? 'bg-[#1F7A8C]/15 ring-2 ring-[#1F7A8C]/40' : 'hover:bg-white'}`}
                      data-react={r.label}
                      // The tutorial points here once the menu is open.
                      data-quest={i === 0 ? 'chat-react' : undefined}
                    >
                      {r.emoji}
                    </button>
                  );
                })}
              </div>
            )}
            <ul className="overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-black/5">
              {actions.map((action, i) => (
                <li key={action.key} className={i > 0 ? 'border-t border-black/5' : ''}>
                  <button
                    ref={!canReact && i === 0 ? first : undefined}
                    type="button"
                    onClick={() => (action.danger ? setConfirming(action) : action.run())}
                    className={`tap flex w-full items-center gap-3 px-4 text-left text-[0.889rem] font-semibold ${
                      action.danger ? 'text-red-700' : 'text-navy'} hover:bg-white`}
                    data-menu-action={action.key}
                  >
                    <span className={action.danger ? 'text-red-600' : 'text-slate-500'}>{action.icon}</span>
                    {action.label}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={onClose}
              className="tap mt-2 w-full rounded-2xl px-4 font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            {/* Said for a screen reader, which cannot see which bubble is lit. */}
            <p className="sr-only">{mine ? 'About your message.' : 'About their message.'}</p>
          </>
        )}
      </div>
    </div>
  );
}

/** The icons the actions use, so ChatView names an action and not a drawing. */
export const MENU_ICONS = {
  reply: <ReplyGlyph size={20} />,
  copy: <CopyGlyph size={20} />,
  edit: <PencilGlyph size={20} />,
  delete: <TrashGlyph size={20} />,
  open: <DownloadGlyph size={20} />,
};

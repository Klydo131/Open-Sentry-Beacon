'use client';

// "Message them": the way into a conversation from a page about one person.
//
// The conversation used to be ON these pages, above the appointments, so a
// Guide or an Explorer scrolled past the whole thread to arrange a time. It
// lives in the bubble now (components/talk/Dock.tsx), and this opens the bubble
// straight at the right person -- on both halves of the app, since the sample
// and the live pages draw the same button.

import { ChatGlyph, PersonGlyph } from '@/components/Glyph';
import { openTalk } from '@/lib/talk-open';
import { emitQuest } from '@/lib/quest';

export function MessageButton({
  pairingId,
  name,
  waiting = 0,
  className = '',
}: {
  pairingId: string;
  name: string;
  /** Messages from them not yet read. Drawn only when there are some. */
  waiting?: number;
  className?: string;
}) {
  // First name only: it is a button, and "Message Maria" is what people say.
  const first = name.trim().split(/\s+/)[0] || name;
  return (
    <button
      type="button"
      data-quest="message-button"
      data-message-button
      onClick={() => {
        openTalk(pairingId);
        emitQuest('beacon:open-chat');
      }}
      className={`tap flex items-center justify-center gap-2 rounded-2xl bg-navy px-4 font-bold text-white transition-transform active:scale-[0.98] sm:px-5 ${className}`}
      aria-label={waiting > 0 ? `Message ${first}, ${waiting} waiting` : `Message ${first}`}
    >
      <ChatGlyph size={20} />
      {/* THE NAME FROM `sm` UP. On a phone it sits beside Profile, under the
          person's own name, and "Message John" beside "Profile" did not fit a
          390px card: it wrapped to two lines and pushed Profile off the edge. */}
      <span className="sm:hidden">Message</span>
      <span className="hidden sm:inline">Message {first}</span>
      {waiting > 0 && (
        <span aria-hidden className="rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-navy">
          {waiting > 99 ? '99+' : waiting}
        </span>
      )}
    </button>
  );
}

/**
 * "Profile": the way to see who somebody is, said in a word.
 *
 * It was a tap on their name, which nothing on the screen announced -- asked
 * for on 30 September 2026: "I still can't see anyway to see the Explorers
 * profile or their image display for Guides and higher up accounts." The name
 * still works; this is the button that says so.
 */
export function ProfileButton({
  open,
  onToggle,
  className = '',
}: {
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      data-profile-button
      // ONE WORD, OPEN OR SHUT. "Hide profile" ran off a 390px card; the
      // pressed look (and aria-expanded) says it is open.
      className={`tap flex shrink-0 items-center justify-center gap-2 rounded-2xl px-4 font-bold text-navy transition-transform active:scale-[0.98] sm:px-5 ${
        open ? 'bg-navy/[0.08] ring-2 ring-navy/40' : 'bg-white ring-1 ring-navy/20 hover:bg-gray-50'} ${className}`}
    >
      <PersonGlyph size={20} />
      <span>Profile</span>
    </button>
  );
}

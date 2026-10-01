// Open the chat bubble, at one conversation or at the list, from anywhere.
//
// ---------------------------------------------------------------------------
// WHY AN EVENT. The bubble is drawn once, by the shell, and the buttons that
// open it live on pages the shell knows nothing about: the Message button on a
// Guide's page for one Explorer, the one on an Explorer's home. A prop would
// have to be threaded through every page in between; a context would tie the
// sample half and the live half to one provider. A window event is the same
// shape on both halves, and it is already how the tutorial is told things
// (lib/quest.ts, emitQuest).
//
// Asked for on 30 September 2026, with a screenshot of the Talk tab: "take out
// the chat in 'talk' room and rename talk to just appointments. Let's just
// improve talk to our bubble chat." The conversation lives in the bubble now,
// so a page that is about one person says "Message" and opens it there.
// ---------------------------------------------------------------------------

export const TALK_OPEN_EVENT = 'beacon:open-talk';

export interface TalkOpenDetail {
  /** The conversation to open. Empty means "the list", or the only thread. */
  pairingId?: string;
}

/** Open the bubble, at this conversation when one is named. */
export function openTalk(pairingId?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<TalkOpenDetail>(TALK_OPEN_EVENT, { detail: { pairingId } }),
  );
}

export const TALK_CLOSE_EVENT = 'beacon:close-talk';

/**
 * Put the bubble down, if it is open.
 *
 * FOR THE TUTORIAL. It walks somebody from "send a message" -- inside the
 * bubble -- to "open the Journey tab", which is on the page the open sheet is
 * covering. Without this the spotlight pointed at a tab nobody could see or
 * press, and the tutorial stood still (found on 30 September 2026 by
 * tests/e2e/tutorial-repeat.js). components/Quest.tsx calls it when the next
 * thing to point at is outside the chat.
 */
export function closeTalk(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TALK_CLOSE_EVENT));
}

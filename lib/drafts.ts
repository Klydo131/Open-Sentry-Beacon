'use client';

// Unsent messages survive leaving the screen.
//
// WHAT THIS IS. You start writing to somebody, get interrupted, and go and look
// at a lesson — or your phone locks, or the browser drops the tab to save
// memory, which phones do constantly. When you come back, what you had written
// is still in the box. Delete it all and the draft goes with it, so an empty box
// stays empty and nothing lingers to surprise you next time.
//
// WHY IT NEVER LEAVES THE DEVICE. A draft is the most private thing in this
// app. It is a half-finished thought, often the hardest one somebody has tried
// to put into words, and frequently it is deleted rather than sent — that
// deletion is a decision, and it has to be real. So drafts live in this
// browser's own storage and are never written to the database, never sent to
// the church, and never readable by a Guide, a Director or anybody else. There
// is deliberately no server side to this file.
//
// ONE DRAFT PER CONVERSATION, and the key is what makes that safe. Every draft
// is stored under the pairing it belongs to. A single shared key would be a
// genuine privacy incident in an app like this one: half a message meant for one
// Explorer would appear in the box open to another.
//
// WHAT IS NOT HERE. Stale drafts are not pruned. A pairing that gets archived
// leaves its draft behind, forever, in that one browser. It is a few hundred
// bytes of the person's own words on their own device, and the alternative —
// timestamps, an expiry sweep, a migration when the shape changes — is more
// moving parts than the problem deserves.

import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'hb-draft:';

/**
 * Storage that cannot take the app down with it.
 *
 * localStorage throws rather than returns null in several ordinary situations:
 * Safari private browsing, a browser set to block site data, and some embedded
 * webviews. A chat box that refuses to accept typing because saving a draft
 * failed would be a far worse bug than not having drafts, so every access here
 * fails quietly and the composer carries on as a plain, unsaved box.
 */
function read(key: string): string {
  try {
    return window.localStorage.getItem(PREFIX + key) ?? '';
  } catch {
    return '';
  }
}

function write(key: string, text: string): void {
  try {
    // An empty box is not a draft. This is the "delete everything and it is
    // gone" half of the feature, and it treats spaces as empty on purpose —
    // somebody who selects all and deletes can leave a stray space behind, and
    // they plainly meant the draft to go.
    if (text.trim() === '') window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, text);
  } catch {
    /* No drafts on this device. The message still sends. */
  }
}

/** Remove a draft now, without waiting for the debounce. See `useDraft`. */
export function clearDraft(key: string | null | undefined): void {
  if (!key) return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* nothing to do */
  }
}

/**
 * A text value that remembers itself, per conversation.
 *
 * Drop-in for `useState('')` in a composer: `useDraft(pairingId)` returns the
 * same `[value, setValue]` pair.
 *
 * `key` may be null, and often is — the Explorer's own page does not know which
 * pairing it is showing until the pairing has loaded, so the first render has
 * nothing to key on. While it is null the box behaves as an ordinary unsaved
 * one, and the moment the id arrives the draft appears.
 *
 * THE BUG THIS SHAPE EXISTS TO PREVENT. The obvious version keeps the text in
 * one piece of state and the key in another, and then for one render after the
 * key changes the state holds the OLD conversation's text alongside the NEW
 * conversation's key — long enough to save one person's words under another
 * person's name. So the text and the key it belongs to are stored together and
 * moved together, and a mismatch reads as empty rather than as somebody else's
 * message.
 */
export function useDraft(key: string | null): readonly [string, (next: string) => void] {
  const [entry, setEntry] = useState<{ key: string | null; text: string }>({
    key: null,
    text: '',
  });

  // Load on arrival, and on every change of conversation. Reading in an effect
  // rather than in a useState initialiser is deliberate: localStorage does not
  // exist while this renders on the server, and seeding state from it would
  // make the first paint disagree with the markup that was sent.
  useEffect(() => {
    setEntry({ key, text: key ? read(key) : '' });
  }, [key]);

  const text = entry.key === key ? entry.text : '';

  const setText = useCallback(
    (next: string) => setEntry({ key, text: next }),
    [key],
  );

  // Save, but not on every keystroke. Someone typing a long message would
  // otherwise write to disk a hundred times; a third of a second after they
  // pause is indistinguishable to them and costs one write.
  useEffect(() => {
    if (!key || entry.key !== key) return undefined;
    const timer = setTimeout(() => write(key, entry.text), 300);
    return () => clearTimeout(timer);
  }, [key, entry]);

  return [text, setText] as const;
}

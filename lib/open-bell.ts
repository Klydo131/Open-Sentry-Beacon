/**
 * One way to say "open the notification panel", from anywhere on the screen.
 *
 * The bell is drawn once, in the app header. Everything else that wants to send
 * somebody to their notifications — the desk's "Unread notifications" row today,
 * anything else tomorrow — is somewhere else in the tree entirely, with no
 * parent in common but the shell.
 *
 * The alternative was a `?bell=1` query parameter, and it does not work: the
 * link points at the screen the person is already on, so Next.js changes the
 * address without re-rendering anything, and `useSearchParams()` drags a
 * Suspense boundary into every statically rendered page for the privilege. A
 * window event costs nothing and cannot go stale in the URL afterwards.
 */
const EVENT = 'beacon:open-bell';

/** Ask the header's bell to open. Safe to call before it has mounted. */
export function openBell(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Listen for {@link openBell}. Returns the unsubscribe, for an effect. */
export function onOpenBell(run: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, run);
  return () => window.removeEventListener(EVENT, run);
}

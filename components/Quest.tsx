'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { closeTalk } from '@/lib/talk-open';
import { scrollMotion } from '@/lib/motion';
import { useRouter, usePathname } from 'next/navigation';
import { useDemo, QUEST_KEY } from '@/lib/demo/store';
import { NAVY, GOLD } from '@/lib/brand';
import {
  QUEST_EVENTS,
  completeByEvent,
  currentStepIndex,
  questProgress,
  stepsFor,
  tasksIn,
} from '@/lib/quest';

// The tutorial overlay. The panel has one home at the bottom, its height is
// measured, and the target is scrolled into the clear band between the header
// and the panel, so the panel never covers what it points at. On a short
// screen the panel moves to the top or collapses to one line.

// Progress is stored per walk, so finishing one does not mark another done.
function keyFor(track: string): string {
  return `${QUEST_KEY}-${track}`;
}

function load(track: string): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(keyFor(track));
    if (raw) return JSON.parse(raw).completed ?? [];
  } catch {}
  return [];
}

function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// A sticky or fixed element does not move when the page scrolls, so never try
// to scroll it into place (that would loop).
function isPinned(el: Element): boolean {
  let node: Element | null = el;
  while (node && node !== document.body) {
    const pos = getComputedStyle(node).position;
    if (pos === 'sticky' || pos === 'fixed') return true;
    node = node.parentElement;
  }
  return false;
}

// The nearest ancestor that clips this element by scrolling (the header's
// sideways strip of icons, for example).
function scrollParent(el: Element): Element | null {
  let node: Element | null = el.parentElement;
  while (node && node !== document.body) {
    const o = getComputedStyle(node);
    if (/(auto|scroll)/.test(`${o.overflowX} ${o.overflowY}`)) return node;
    node = node.parentElement;
  }
  return null;
}

// The bottom bar's height (0 on a computer); the panel stands on top of it.
function tabBarHeight(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--tab-bar');
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Where the page's own sticky header ends, so we never scroll a target under it.
function headerBottom(): number {
  const h = document.querySelector('header');
  if (!h) return 12;
  const r = h.getBoundingClientRect();
  return r.top <= 1 ? r.bottom + 12 : 12;
}

export function Quest() {
  const { endTutorial, tutorialTrack } = useDemo();
  // Which walk this is, decided by the store when the tutorial starts.
  const steps = stepsFor(tutorialTrack);
  const router = useRouter();
  const pathname = usePathname();
  const [completed, setCompleted] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [manual, setManual] = useState<null | 'open' | 'shut'>(null);
  const [hydrated, setHydrated] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [below, setBelow] = useState(false);
  // The wording for whichever fallback we landed on, or null when we are
  // pointing at the step's real target.
  const [altHint, setAltHint] = useState<string | null>(null);
  // The panel's position for this target: bottom, top, or collapsed to a bar
  // when neither edge has room.
  const [place, setPlace] = useState<'bottom' | 'top' | 'mini'>('bottom');
  const placedFor = useRef<string>('');
  // Attempts to bring this target into view, bounded.
  const placeTries = useRef<{ key: string; n: number }>({ key: '', n: 0 });
  // Whether this target was already slid in from the side.
  const slidFor = useRef<string>('');
  // The scroll position at the last look, to tell when the page is at rest.
  const lastY = useRef<number>(-1);
  const panelRef = useRef<HTMLElement | null>(null);
  // The target is on this screen but scrolled out of sight; the panel offers to go there.
  const [offScreen, setOffScreen] = useState<'above' | 'below' | null>(null);
  const targetEl = useRef<Element | null>(null);
  const expandedH = useRef<number>(0);

  useEffect(() => {
    setCompleted(load(tutorialTrack));
    setHydrated(true);
  }, [tutorialTrack]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(keyFor(tutorialTrack), JSON.stringify({ completed }));
    } catch {}
  }, [completed, hydrated, tutorialTrack]);

  // Tick steps off when the app announces an action; only this walk's steps count.
  useEffect(() => {
    const handlers = QUEST_EVENTS.map((type) => {
      const fn = () => setCompleted((c) => completeByEvent(steps, c, type));
      window.addEventListener(type, fn);
      return [type, fn] as const;
    });
    return () => handlers.forEach(([t, fn]) => window.removeEventListener(t, fn));
  }, [steps]);

  const idx = currentStepIndex(steps, completed);
  const step = idx === -1 ? null : steps[idx];
  const { done, total } = questProgress(steps, completed);

  useEffect(() => {
    if (!step || !step.target || dismissed) {
      setRect(null);
      // The closing card points at nothing.
      setOffScreen(null);
      targetEl.current = null;
      return;
    }

    // The first match that is visible: some targets exist twice (desktop header and Menu).
    const find = (name: string) =>
      Array.from(document.querySelectorAll(`[data-quest="${name}"]`)).find(isVisible) ?? null;

    // Whether the page can still scroll that way. If it cannot, point at the
    // target where it is instead of waiting for a scroll that never happens.
    const canScroll = (delta: number) => {
      const max =
        document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const y = window.scrollY;
      return delta > 0 ? y < max - 1 : y > 1;
    };

    const measure = () => {
      // The real control first, then the tab that reveals it, then the card that opens the room.
      let el = find(step.target);
      let hint: string | null = null;
      let key = step.target;
      if (!el) {
        for (const fb of step.fallbacks ?? []) {
          const cand = find(fb.target);
          if (cand) {
            el = cand;
            hint = fb.hint;
            key = fb.target;
            break;
          }
        }
      }
      setAltHint(hint);

      // If the next target is outside an open chat sheet, close the chat first.
      const sheet = document.querySelector('[data-talk-sheet]');
      if (el && sheet && !sheet.contains(el)) closeTalk();

      targetEl.current = el;

      if (!el) {
        setRect(null); // not on this screen; the panel says where to go
        setOffScreen(null);
        // With no target, open the panel fully: nothing to avoid.
        setPlace('bottom');
        return;
      }

      // Is the page at rest? Scrolls only ever start from rest: WebKit restarts a
      // smooth scroll that is asked for again mid-animation.
      const settled = Math.abs(window.scrollY - lastY.current) < 1;
      lastY.current = window.scrollY;

      const pinned = isPinned(el);
      const top = headerBottom();
      const vh = window.innerHeight - tabBarHeight();
      const pnl = panelRef.current?.getBoundingClientRect();
      if (pnl && place !== 'mini') expandedH.current = pnl.height;
      // Cap the reserved height, so a wordy step cannot keep the panel collapsed.
      const hExp = Math.min(expandedH.current || 220, vh * 0.45);

      let r = el.getBoundingClientRect();

      // Only the panel's own column matters: on a wide screen a target to its left never conflicts.
      const sameColumn = !pnl || (r.left < pnl.right && r.right > pnl.left);

      // Reserve the space on the side the panel is actually on.
      const panelAtTop = !!pnl && sameColumn && place === 'top';
      const bandTop = panelAtTop ? Math.max(top, (pnl as DOMRect).bottom + 12) : top;
      const bandBottom = sameColumn && !panelAtTop ? vh - (hExp + 12) : vh - 12;
      const band = bandBottom - bandTop;

      // Place the target in the clear band once per step and element.
      const placeKey = `${step.id}:${key}`;

      // Slide a target into view sideways first: a tab can sit past the edge of its
      // own scrolling strip. Setting the strip's scrollLeft works the same in every
      // engine and is repeated whenever the tab is clipped again.
      const strip = scrollParent(el);
      const clip = strip?.getBoundingClientRect();
      const clipped = !!clip && (r.right > clip.right + 1 || r.left < clip.left - 1);
      if (strip && clip && clipped) {
        const before = strip.scrollLeft;
        strip.scrollLeft += r.right > clip.right + 1
          ? r.right - clip.right + 8
          : -(clip.left - r.left + 8);
        if (strip.scrollLeft !== before) {
          setRect(el.getBoundingClientRect());
          return; // re-measure next tick
        }
      }

      if (slidFor.current !== placeKey) {
        const vw = document.documentElement.clientWidth;
        const offViewport = r.right > vw - 4 || r.left < 4;

        // Off the screen's edge with no strip of its own: move it the shortest way in, once.
        if (offViewport && !clipped) {
          slidFor.current = placeKey;
          // Instant, so the ring is never measured mid-slide.
          el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
          return; // re-measure next tick
        }
      }
      // Only from rest (see `settled`).
      if (!pinned && settled && placedFor.current !== placeKey && band > 40) {
        placedFor.current = placeKey;
        placeTries.current = {
          key: placeKey,
          n: (placeTries.current.key === placeKey ? placeTries.current.n : 0) + 1,
        };
        const wantTop = r.height >= band ? bandTop : bandTop + (band - r.height) / 2;
        const delta = r.top - wantTop;
        if (Math.abs(delta) > 6 && canScroll(delta)) {
          window.scrollBy({ top: delta, behavior: scrollMotion() });
          // Draw the ring where the target is now; it follows the page as it scrolls.
          setRect(el.getBoundingClientRect());
          return; // re-measure next tick
        }
      }

      r = el.getBoundingClientRect();

      // Is the target visible now? If the person scrolled it away, do not scroll it
      // back (they asked to be guided, not driven); the panel offers a way there.
      // A pinned target is on screen by definition.
      if (pinned) setOffScreen(null);
      else if (r.bottom < top + 4) setOffScreen('above');
      else if (r.top > vh - 4) setOffScreen('below');
      else setOffScreen(null);

      // A placement that leaves the target off screen does not count (the chat can
      // scroll itself afterwards). Retry from rest, at most three times.
      if (!pinned && settled
          && (r.bottom < top + 4 || r.top > vh - 4)
          && placedFor.current === placeKey
          && placeTries.current.key === placeKey && placeTries.current.n < 3) {
        placedFor.current = '';
      }

      // Correct drift from things that move the page later (the chat scrolling,
      // a panel changing height), but not a person's own scrolling.
      const drifted =
        !pinned &&
        r.bottom > top &&
        r.top < vh &&
        (r.top < top - 2 ||
        (sameColumn && place !== 'mini' && pnl && r.bottom > pnl.top && r.top < pnl.bottom));
      // Only from rest, as above.
      if (drifted && settled && band > 40) {
        const wantTop = r.height >= band ? bandTop : bandTop + (band - r.height) / 2;
        const delta = r.top - wantTop;
        if (Math.abs(delta) > 8 && canScroll(delta)) {
          window.scrollBy({ top: delta, behavior: scrollMotion() });
          setRect(r);
          return;
        }
      }

      // The panel's place, from where the target actually ended up.
      let next: 'bottom' | 'top' | 'mini';
      // A pinned target in the lower half (a bottom-bar tab) sends the panel to the top.
      if (pinned) next = r.top > vh / 2 ? 'top' : 'bottom';
      else if (!sameColumn) next = 'bottom';
      else if (r.bottom + 12 <= vh - hExp) next = 'bottom';
      else if (r.top - 12 >= top + hExp) next = 'top';
      else next = 'mini';
      setPlace(next);

      setRect(r);
      // Arrow above the target normally; below it when the target is tight
      // against the header and there is no room above.
      setBelow(pinned || r.top - top < 44);
    };

    measure();
    const interval = setInterval(measure, 350);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(interval);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [idx, dismissed, step, place]);

  const skip = useCallback(() => {
    if (step) setCompleted((c) => Array.from(new Set([...c, step.id])));
  }, [step]);

  // Back un-completes the previous step.
  const back = useCallback(() => {
    const here = idx === -1 ? steps.length : idx;
    if (here <= 0) return;
    const prev = steps[here - 1];
    placedFor.current = ''; // re-place the spotlight for the step we return to
    setCompleted((c) => c.filter((id) => id !== prev.id));
  }, [idx, steps]);

  const canGoBack = (idx === -1 ? steps.length : idx) > 0;
  const finish = useCallback(() => endTutorial(), [endTutorial]);
  const replay = useCallback(() => {
    placedFor.current = '';
    setCompleted([]);
  }, []);

  if (!hydrated) return null;

  // The person can force the panel open or shut it; otherwise it opens when there is room.
  const open = manual === 'open' || (manual === null && place !== 'mini');

  // Already on this step's screen? (/dm/<id> counts as /dm.)
  const onRoute = !!step?.route && !!pathname && pathname.startsWith(step.route);

  // Hidden: a small tab in the corner, deliberately NOT at bottom-centre where
  // the page's own actions sit.
  if (dismissed) {
    return (
      <button
        onClick={() => setDismissed(false)}
        data-steps-aside-for-chat
        className="safe-bottom fixed bottom-4 right-4 z-[60] rounded-full px-4 py-2 text-xs font-bold shadow-lg"
        style={{ backgroundColor: GOLD, color: NAVY }}
      >
        ✦ Resume tutorial {done < total ? `· ${done}/${total}` : ''}
      </button>
    );
  }

  const arrowX = rect
    ? Math.min(Math.max(rect.left + rect.width / 2, 26), window.innerWidth - 26)
    : 0;

  return (
    <>
      {rect && step && !offScreen && (
        <div className="pointer-events-none fixed inset-0 z-[55]" aria-hidden>
          <div
            className="absolute rounded-xl"
            style={{
              left: rect.left - 6,
              top: rect.top - 6,
              width: rect.width + 12,
              height: rect.height + 12,
              boxShadow: `0 0 0 3px ${GOLD}, 0 0 0 9999px rgba(30,42,74,0.45)`,
              transition: 'all .18s ease',
            }}
          />
          <div
            /* A class, so the reduced-motion rule can stop the bob. */
            className="quest-arrow absolute -translate-x-1/2 text-3xl"
            style={{
              left: arrowX,
              top: below ? rect.bottom + 8 : rect.top - 40,
              color: GOLD,
              filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.5))',
            }}
          >
            {below ? '▲' : '▼'}
          </div>
        </div>
      )}

      <aside
        ref={panelRef}
        /* Padding clears the phone's home indicator, so Next can be tapped. */
        className={`fixed z-[60] mx-auto w-full max-w-md bg-white p-3 lift-3 ring-1 ring-black/10 sm:inset-x-auto sm:right-4 sm:w-96 sm:rounded-2xl sm:p-4 ${
          place === 'top'
            ? 'inset-x-0 top-0 rounded-b-2xl sm:top-4'
            : 'quest-dock inset-x-0 rounded-t-2xl'
        }`}
        role="dialog"
        aria-label="Beacon tutorial"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold text-navy">
            ✦ Tutorial{' '}
            <span className="font-semibold text-gray-400">
              {done}/{total}
            </span>
          </span>
          {/* Collapsed, the instruction is still shown. */}
          {!open && step ? (
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-navy">
              {step.title}
            </span>
          ) : (
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-1.5 rounded-full transition-all"
                style={{ width: `${(done / total) * 100}%`, backgroundColor: GOLD }}
              />
            </div>
          )}
          {/* Back and Skip stay available when collapsed. */}
          {!open && step && (
            <>
              <button
                onClick={back}
                disabled={!canGoBack}
                aria-label="Previous step"
                className="compact-ui grid h-8 shrink-0 place-items-center rounded-lg bg-gray-100 px-2 text-xs font-bold text-gray-600 disabled:opacity-40"
              >
                ←
              </button>
              <button
                onClick={step.id === 'done' ? finish : skip}
                aria-label={step.id === 'done' ? 'Finish tutorial' : 'Skip this step'}
                className="compact-ui grid h-8 shrink-0 place-items-center rounded-lg bg-gray-100 px-2 text-xs font-bold text-gray-600"
              >
                {step.id === 'done' ? '✓' : '→'}
              </button>
            </>
          )}
          <button
            onClick={() => setManual(open ? 'shut' : 'open')}
            aria-label={open ? 'Shrink tutorial' : 'Show tutorial step'}
            aria-expanded={open}
            className="compact-ui grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-100 text-sm"
          >
            {open ? '▾' : '▴'}
          </button>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Hide tutorial"
            className="compact-ui grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-100 text-base"
          >
            ×
          </button>
        </div>

        {/* Capped and scrollable, so the text never decides whether the panel fits. */}
        {open && (
          <div className="mt-2 max-h-[34vh] overflow-y-auto [max-height:34dvh] sm:max-h-[40vh] sm:[max-height:40dvh]">
            {step ? (
              <>
                {/* Where this happens, before what to do. */}
                {step.where && (
                  <p className="mb-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-gray-400">
                    <span aria-hidden>📍</span>
                    <span className="min-w-0 truncate">{step.where}</span>
                  </p>
                )}
                <p className="font-bold text-navy">{step.title}</p>
                <p className="mt-0.5 text-sm leading-snug text-gray-600">
                  {altHint ?? step.hint}
                </p>
                {/* What the feature is for, and who can see it. */}
                {step.learn && (
                  <div
                    className="mt-2 rounded-lg border-l-4 bg-gray-50 px-3 py-2"
                    style={{ borderColor: GOLD }}
                  >
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                      What this is
                    </p>
                    <p className="mt-0.5 text-sm leading-snug text-gray-600">
                      {step.learn}
                    </p>
                  </div>
                )}
                {/* The target is on another screen: offer to go there. */}
                {/* Only when we are not already there. */}
                {step.target && !rect && step.route && !onRoute && (
                  <button
                    onClick={() => router.push(step.route!)}
                    className="compact-ui mt-2 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-bold text-white"
                    style={{ backgroundColor: NAVY }}
                  >
                    <span>{step.routeLabel ?? 'Take me there'}</span>
                    <span aria-hidden>→</span>
                  </button>
                )}
                {step.target && !rect && (!step.route || onRoute) && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    Scroll down to your Explorers and open one to carry on.
                  </p>
                )}
                {/* On this screen but scrolled away: offer to show it rather than scrolling the page. */}
                {offScreen && (
                  <button
                    onClick={() => {
                      targetEl.current?.scrollIntoView({
                        behavior: scrollMotion(),
                        block: 'center',
                      });
                    }}
                    className="compact-ui mt-2 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-bold"
                    style={{ backgroundColor: GOLD, color: NAVY }}
                  >
                    <span>
                      It&rsquo;s {offScreen === 'above' ? 'above' : 'below'} here.
                      Show me
                    </span>
                    <span aria-hidden>{offScreen === 'above' ? '↑' : '↓'}</span>
                  </button>
                )}
                <div className="mt-2 flex gap-2">
                  {/* Back. */}
                  <button
                    onClick={back}
                    disabled={!canGoBack}
                    aria-label="Previous step"
                    className="compact-ui rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600 disabled:opacity-40"
                  >
                    ← Back
                  </button>
                  {step.id === 'done' ? (
                    <button
                      onClick={finish}
                      aria-label="Finish tutorial"
                      className="compact-ui rounded-lg px-4 py-2 text-sm font-bold text-white"
                      style={{ backgroundColor: NAVY }}
                    >
                      Finish ✓
                    </button>
                  ) : (
                    <button
                      onClick={skip}
                      // A stable accessible name, so the visible label can be
                      // reworded without silently breaking screen readers.
                      aria-label="Skip this step"
                      className="compact-ui rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600"
                    >
                      Skip →
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="font-bold text-navy">Tutorial complete 🎉</p>
                <p className="mt-0.5 text-sm text-gray-600">
                  You’ve learned the heart of Beacon. Keep exploring, or begin for
                  real.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={replay}
                    className="compact-ui rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600"
                  >
                    Replay
                  </button>
                  <button
                    onClick={finish}
                    className="compact-ui rounded-lg px-4 py-2 text-sm font-bold text-white"
                    style={{ backgroundColor: NAVY }}
                  >
                    Done
                  </button>
                </div>
              </>
            )}

            {/* Computers only: on a phone the recap made the panel too tall. */}
            <ol className="mt-2 hidden space-y-0.5 sm:block">
              {tasksIn(steps).map((s) => {
                const isDone = completed.includes(s.id);
                const isCurrent = step?.id === s.id;
                return (
                  <li
                    key={s.id}
                    className={`flex items-center gap-2 text-sm ${
                      isDone ? 'text-gray-400 line-through' : 'text-navy'
                    } ${isCurrent ? 'font-bold' : ''}`}
                  >
                    <span style={{ color: isDone ? '#7FB03A' : GOLD }}>
                      {isDone ? '✓' : isCurrent ? '▸' : '○'}
                    </span>
                    {s.title}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </aside>
    </>
  );
}

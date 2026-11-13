'use client';

// Move between the live app and the offline tutorial.
//
// THEY ARE TWO SEPARATE THINGS. Live keeps real people in a real database and
// is invitation-only. The tutorial invents its people in this browser, works on
// a plane, and cannot reach a database at all. Neither is a cut-down version of
// the other — the same screens and the same features, different data behind
// them — and this control exists so nobody has to take that on trust.
//
// It used to only DESCRIBE the mode, because the mode was fixed at build time
// by whether Supabase keys were present. A visitor to a deployed church app
// could not reach the tutorial by any route, and the one link this panel
// offered pointed at a query parameter nothing read. lib/tutorial.tsx moved the
// choice to runtime, so this now actually moves you.
//
// It can only ever move in the safe direction. Choosing the tutorial cannot
// touch a database; leaving it cannot conjure one that was never configured,
// which is why a deployment with no keys is told what it would take rather than
// given a button that looks like it worked.

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTutorialMode } from '@/lib/tutorial';
import { AnchoredPanel } from '@/components/AnchoredPanel';
import { usePresence } from '@/lib/motion';

export function ModeSwitch({ onDark = false }: { onDark?: boolean }) {
  const [open, setOpen] = useState(false);
  // Kept on the screen while it goes back into the button (lib/motion.ts).
  const panel = usePresence(open);
  const { tutorial, hasDatabase, enterTutorial, leaveTutorial } = useTutorialMode();
  const router = useRouter();
  const anchor = useRef<HTMLDivElement>(null);

  const go = (action: () => void) => {
    action();
    setOpen(false);
    // Back to the front door. Whichever mode you just left, the screen you were
    // on belongs to it — a Guide's desk full of sample people is not a screen
    // the live app should try to redraw with real ones.
    router.push('/');
  };

  return (
    <div className="relative shrink-0" ref={anchor}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch between the live app and the tutorial"
        title={tutorial ? 'You are in the tutorial' : 'You are in the live app'}
        className={
          onDark
            ? 'tap-sm grid place-items-center rounded-full bg-white/10 px-2.5 hover:bg-white/20'
            : 'tap-sm grid place-items-center rounded-full bg-navy/5 px-2.5 hover:bg-navy/10'
        }
      >
        <span aria-hidden>{tutorial ? '🧪' : '🟢'}</span>
        <span className="ml-1 hidden text-xs font-bold lg:inline">
          {tutorial ? 'TUTORIAL' : 'LIVE'}
        </span>
      </button>

      {panel.mounted && (
        <AnchoredPanel
          leaving={panel.leaving}
          anchor={anchor}
          onClose={() => setOpen(false)}
          width={288}
          label="Live app or tutorial"
          className="p-4"
        >
          <p className="font-bold text-navy">
            {tutorial ? 'You are in the tutorial' : 'You are in the live app'}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            {tutorial
              ? 'Sample people, invented in this browser. Nothing here is sent anywhere, and nothing here can reach your church database.'
              : 'Real people, real database, real security. Every feature here also works in the tutorial.'}
          </p>

          <div className="mt-3 space-y-2">
            {tutorial && hasDatabase && (
              <button
                type="button"
                onClick={() => go(leaveTutorial)}
                className="tap block w-full rounded-xl bg-navy px-3 text-left text-sm font-semibold text-white hover:bg-navy/90"
              >
                🟢 Go to the live app
              </button>
            )}

            {!tutorial && (
              <>
                <button
                  type="button"
                  onClick={() => go(enterTutorial)}
                  className="tap block w-full rounded-xl bg-navy/5 px-3 text-left text-sm font-semibold text-navy hover:bg-navy/10"
                >
                  🧪 Open the tutorial
                </button>
                <p className="text-xs text-gray-500">
                  Nothing you do there touches the church database.
                </p>
              </>
            )}

            {tutorial && !hasDatabase && (
              <>
                <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  This copy has no database connected, so the tutorial is all
                  there is. To run it against a real one, set{' '}
                  <span className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</span> and{' '}
                  <span className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> on
                  your host and redeploy.
                </p>
                <p className="text-xs text-gray-500">
                  That is the whole switch. There is no flag to remember.
                </p>
              </>
            )}
          </div>
        </AnchoredPanel>
      )}
    </div>
  );
}

'use client';

// A box under a button that grows open and shrinks closed, instead of
// appearing in one frame and pushing the page down with a jolt (3 November
// 2026: "There is still a pop out where the user gets shocked pressing the
// button new"). The movement itself is in lib/motion.ts (growIn, shrinkOut),
// behind the reduce-motion setting.

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { growIn, MOTION, shrinkOut, usePresence } from '@/lib/motion';

export function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const presence = usePresence(open, MOTION.base);
  useLayoutEffect(() => {
    if (open) growIn(box.current);
    else if (presence.leaving) shrinkOut(box.current);
  }, [open, presence.leaving]);
  return presence.mounted ? <div ref={box} data-reveal={open ? 'open' : 'closing'}>{children}</div> : null;
}

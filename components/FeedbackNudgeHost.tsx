'use client';

import { useDemo } from '@/lib/demo/store';
import { FeedbackNudge } from './FeedbackNudge';

// Keeps the nudge out of the tutorial's way.
//
// Being asked. while halfway through a guided walk is the
// moment a prompt stops being helpful and becomes an obstacle, and both live at
// the bottom of the screen where they would collide. The tutorial flag lives in
// the demo store, so this thin wrapper reads it and the nudge itself stays
// free of that dependency.
export function FeedbackNudgeHost() {
  const { tutorialActive } = useDemo();
  return <FeedbackNudge suppressed={tutorialActive} />;
}

'use client';

// The four things that only belong to the offline tutorial.
//
// These used to be gated on IS_DEMO in app/layout.tsx, which is a server
// component and so can only read a build-time constant. On a church's deployed
// app that constant is permanently false, so the guided walk — the entire
// point of having a tutorial — could never appear there no matter what the
// visitor chose. Wrapping them in a client component is what lets the decision
// be made per visitor instead of per build.
//
// The ribbon is the one that must not slip. A screen full of invented people
// with nothing saying so is how somebody types a real prayer request into
// sample data.

import { ConsentHost } from '@/components/ConsentHost';
import { TutorialHost } from '@/components/TutorialHost';
import { DemoRibbon } from '@/components/DemoRibbon';
import { TutorialBar } from '@/components/TutorialBar';
import { FeedbackNudgeHost } from '@/components/FeedbackNudgeHost';
import { useTutorialMode } from '@/lib/tutorial';

export function TutorialExtras() {
  const { tutorial } = useTutorialMode();
  if (!tutorial) return null;
  return (
    <>
      <TutorialBar />
      <ConsentHost />
      <TutorialHost />
      <DemoRibbon />
      <FeedbackNudgeHost />
    </>
  );
}

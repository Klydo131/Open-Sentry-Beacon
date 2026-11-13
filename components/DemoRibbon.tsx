'use client';

import { useDemo } from '@/lib/demo/store';
import { BuildNotice } from './BuildNotice';

// The "this is sample data" marker.
//
// It exists because an installed app shows no address bar. Someone running this
// alongside a real church system has no other way to tell, at a glance, which
// window is which — and the cost of getting that wrong is typing a real person's
// details into a demo, or trusting a demo number in a real meeting.
//
// It says its piece periodically rather than sitting there permanently. See
// BuildNotice for why: a label nobody can dismiss stops being read after a few
// seconds and only ever costs you the control underneath it.
//
// If you connect a real backend, delete this from app/layout.tsx. Leaving it in
// front of real users is worse than useless — it teaches them to ignore it.
//
// It stays out of the way entirely while the tutorial is running. The notice
// sits near the top of the screen and the tutorial's last step points at the
// avatar in the header: the notice landed on top of it and swallowed the tap,
// so the step could never be completed. Worse, because the notice appears on a
// timer, whether it collided depended on when you happened to reach that step —
// which is why the tutorial behaved differently on different runs.
export function DemoRibbon() {
  const { tutorialActive } = useDemo();
  if (tutorialActive) return null;
  return <BuildNotice label="DEMO · sample data" color="#6D4AA8" />;
}

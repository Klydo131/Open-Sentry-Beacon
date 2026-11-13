'use client';

import { useDemo } from '@/lib/demo/store';
import { Quest } from './Quest';

// Mounts the tutorial overlay app-wide, but only while the tutorial is running,
// so the arrow can follow the user across screens. Lives in the root layout.
export function TutorialHost() {
  const { tutorialActive, currentUser } = useDemo();
  if (!tutorialActive || !currentUser) return null;
  return <Quest />;
}

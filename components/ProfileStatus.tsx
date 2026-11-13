'use client';

// YOUR PROFILE, AND WHETHER THE APP IS CONNECTED, AS ONE ROUND BUTTON.
//
// Asked for on 13 November 2026. So the header's name,
// initials and LIVE chip become one icon: green when the app can reach the
// church, red when it cannot. The dot is never the only signal: the button's
// name says it in words too, for a screen reader and on a long press.

import Link from 'next/link';
import { PersonGlyph } from '@/components/Glyph';
import { useOnline } from '@/lib/online';

export function ProfileStatus({ href = '/profile', onDark = true, quest, onClick }: {
  href?: string;
  onDark?: boolean;
  /** The tutorial's anchor for this button, when it has one. */
  quest?: string;
  onClick?: () => void;
}) {
  const { online } = useOnline();
  const state = online ? 'Connected' : 'Offline';
  return (
    <Link
      href={href}
      title={`Your profile. ${state}.`}
      aria-label={`Your profile. ${state}.`}
      data-profile-status={online ? 'online' : 'offline'}
      data-quest={quest}
      onClick={onClick}
      className={`tap-sm relative grid w-11 shrink-0 place-items-center rounded-full ${onDark ? 'bg-white/15 hover:bg-white/25' : 'bg-navy/5 hover:bg-navy/10'}`}
    >
      <PersonGlyph size={22} />
      <span
        aria-hidden
        className={`absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full ring-2 ${onDark ? 'ring-[#0f5a43]' : 'ring-white'} ${online ? 'bg-green-500' : 'bg-red-500'}`}
      />
    </Link>
  );
}

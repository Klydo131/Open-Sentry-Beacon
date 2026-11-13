'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/lib/demo/store';
import { roleNoun } from '@/lib/brand';
import { AnchoredPanel } from '@/components/AnchoredPanel';
import { usePresence } from '@/lib/motion';
import { Avatar } from '@/components/ui';
import type { Role } from '@/lib/types';

// DEMO ONLY. DELETE THIS BEFORE YOU CONNECT A REAL BACKEND.
//
// It lets anybody put themselves into any role, which is precisely the thing a
// real deployment must make impossible. It is safe here for one reason only:
// there is no server, so "admin" grants access to sample data sitting in your
// own browser and nothing else.
//
// It exists because the people deciding whether a church adopts this are usually
// the pastor and the board — exactly the roles whose screens a seeker account
// cannot open. Being bounced off /admin is correct behaviour in a real app and
// useless in a demo. The panel says "demo only" out loud rather than leaving
// somebody to wonder why they can suddenly promote themselves.
//
// TO REMOVE IT: delete this file, delete <RoleSwitcher /> from
// components/AppShell.tsx, and delete `setMyRole` from lib/demo/store.tsx. That
// last one is the function that actually changes the role; leaving it behind is
// how a removed feature comes back through some other button.

const ROLES: { role: Role; icon: string; blurb: string }[] = [
  { role: 'ds', icon: '🌱', blurb: 'Follow a journey with a Guide' },
  { role: 'dm', icon: '🤝', blurb: 'Guide Explorers, one at a time' },
  { role: 'admin', icon: '🛡️', blurb: 'Invite people, pair them, see the numbers' },
  { role: 'executive', icon: '⭐', blurb: 'Oversee every church' },
];

const HOME: Record<Role, string> = {
  executive: '/admin',
  admin: '/admin',
  dm: '/dm',
  ds: '/ds',
};

export function RoleSwitcher() {
  const { db, currentUser, userId, setMyRole, signInAs } = useDemo();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Kept on the screen while it goes back into the button (lib/motion.ts).
  const panel = usePresence(open);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Tapping elsewhere and Escape both close this. Both live in AnchoredPanel
  // now, once, for every panel in the app.

  if (!currentUser) return null;

  // Everyone who can actually be signed into. An unapproved sign-up is left
  // out on purpose — it is the approval gate, and it is worth seeing that it
  // holds rather than quietly waving it through here.
  const people = db.profiles.filter((x) => x.is_approved);

  const pick = (role: Role) => {
    setOpen(false);
    if (role === currentUser.role) {
      router.push(HOME[role]);
      return;
    }
    // No navigation here on purpose. Changing the role makes the screen you
    // are standing on one this role cannot see, and AppShell forwards you to
    // the right home. Pushing a route here as well would race that redirect.
    setMyRole(role);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Try any account"
        title="Try any account"
        className="tap-sm flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 text-sm font-semibold hover:bg-white/20 sm:px-3"
      >
        <span aria-hidden>🎭</span>
        <span className="hidden lg:inline">Try an account</span>
      </button>

      {panel.mounted && (
        <AnchoredPanel
          leaving={panel.leaving}
          anchor={wrapRef}
          onClose={() => setOpen(false)}
          width={384}
          label="Try any account"
          className="text-navy"
        >
          <div className="shrink-0 border-b border-black/5 px-4 py-3">
            <p className="font-extrabold">Try any account</p>
            <p className="mt-0.5 text-sm text-gray-500">
              Demo only. None of this exists once a real backend is connected.
            </p>
          </div>

          {/* One scroll region for both lists. Two independently scrolling
              lists in a panel taller than the phone let the second heading
              sit on top of the first list's clipped last row. */}
          <div>
            <div className="border-b border-black/5 bg-gray-50 px-4 py-2">
              <p className="text-sm font-bold text-gray-500">
                Change your own role
              </p>
            </div>
            {ROLES.map((r) => {
              const on = r.role === currentUser.role;
              return (
                <button
                  key={r.role}
                  onClick={() => pick(r.role)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 ${
                    on ? 'bg-amber-50' : ''
                  }`}
                >
                  <span className="text-2xl" aria-hidden>
                    {r.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      {roleNoun(r.role)}
                    </span>
                    <span className="block text-sm text-gray-500">{r.blurb}</span>
                  </span>
                  {on && (
                    <span className="shrink-0 text-sm font-bold text-amber-600">
                      Now
                    </span>
                  )}
                </button>
              );
            })}

            {/* The other half of "use every account": not just your own account
                wearing another role, but the sample people themselves, with the
                seekers, conversations and history already attached to them.
                Switching your role shows you the screens; becoming Maria shows
                you the screens with a real week's work already in them. */}
            <div className="border-y border-black/5 bg-gray-50 px-4 py-2">
              <p className="text-sm font-bold text-gray-500">
                …or sign in as someone else
              </p>
            </div>
            {people.map((pp) => {
              const on = pp.id === userId;
              return (
                <button
                  key={pp.id}
                  onClick={() => {
                    setOpen(false);
                    if (!on) signInAs(pp.id);
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 ${
                    on ? 'bg-amber-50' : ''
                  }`}
                >
                  <Avatar
                    name={pp.full_name}
                    size={34}
                    photo={pp.photo}
                    avatar={pp.avatar}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {pp.full_name}
                    </span>
                    <span className="block text-sm text-gray-500">
                      {roleNoun(pp.role)}
                    </span>
                  </span>
                  {on && (
                    <span className="shrink-0 text-sm font-bold text-amber-600">
                      You
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </AnchoredPanel>
      )}
    </div>
  );
}

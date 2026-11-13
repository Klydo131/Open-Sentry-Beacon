'use client';

// "One person is stuck on an old version and nobody can work out why."
//
// THE CAUSE, and it is not the update system. Hosts give every preview — and
// often every individual deployment — its own hostname, and to a browser a
// different hostname is a different application: its own icon, its own service
// worker, its own storage. A copy installed from one of those addresses can
// NEVER receive a production update. No amount of checking helps: the origin it
// was installed from is frozen at the build that was there that day, and the
// app is dutifully staying up to date with a version of itself that will never
// move again.
//
// lib/canonical.ts already knows this. Until now it was used for exactly one
// thing — deciding whether to OFFER an install — and was deliberately silent
// otherwise, because a banner across the front door of a preview reads to a
// casual visitor like a security warning about the site itself.
//
// THAT REASONING DOES NOT SURVIVE INSTALLATION. A visitor on a preview link
// closes the tab and the problem is over. Somebody who has INSTALLED from one
// has a permanently broken icon on their home screen, is being told by everyone
// else that the app has changed, and has no way to discover why theirs has not.
// Silence protects nobody there. So this speaks only to an installed copy, and
// it says the one thing that actually fixes it.

import { useEffect, useState } from 'react';
import { APP_SHORT_NAME } from '@/lib/brand';
import { canonicalUrl, onCanonicalHost } from '@/lib/canonical';
import { isStandalone } from '@/components/InstallPrompt';

export function FrozenCopy() {
  const [stuck, setStuck] = useState(false);
  const [where, setWhere] = useState('');

  useEffect(() => {
    // Installed AND on an address that can never update. Both halves are
    // required: a browser tab on a preview is a visitor, not a casualty.
    if (!isStandalone()) return;
    if (onCanonicalHost()) return;
    setStuck(true);
    setWhere(window.location.host);
  }, []);

  if (!stuck) return null;

  const home = canonicalUrl('/');

  return (
    <div className="no-print fixed inset-x-0 top-0 z-[70] p-3">
      <div className="mx-auto max-w-lg rounded-2xl bg-amber-50 p-4 lift-3 ring-1 ring-amber-300">
        <p className="font-bold text-amber-900">
          This copy can never update
        </p>
        <p className="mt-1 text-sm text-amber-900">
          It was installed from <strong>{where}</strong>, which is a temporary
          address. Your app is not broken and your data is safe, but this icon is
          stuck on the day it was installed, and no update can ever reach it.
        </p>
        <p className="mt-2 text-sm text-amber-900">
          Open the real address, install from there, then delete this icon.
        </p>
        <a
          href={home}
          className="tap mt-3 inline-flex items-center rounded-xl bg-amber-900 px-4 font-bold text-white"
        >
          Open the real {APP_SHORT_NAME}
        </a>
        <p className="mt-2 break-all text-xs text-amber-800">{home}</p>
      </div>
    </div>
  );
}

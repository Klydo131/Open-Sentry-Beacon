'use client';

import { useEffect, useState } from 'react';
import { CANONICAL_HOST } from '@/lib/build-info';
import { versionLabel } from '@/lib/app-update';
import { canonicalUrl, onCanonicalHost } from '@/lib/canonical';
import { ShareButton } from '@/components/ShareSheet';

// "Which Beacon am I looking at?"
//
// Two identical candle icons appeared in a taskbar with no way to tell them
// apart, and the second one could never update. The cause is that a preview
// deployment has its own hostname, and a different hostname is a different app
// to the browser: its own icon, its own service worker, its own storage. Installing
// from a preview link is therefore installing a second Beacon, permanently
// separate from the real one.
//
// Previews can no longer be installed. That does nothing for copies already on a
// machine, and those cannot be identified from the outside because the icon and
// the window title are the same. So the app states plainly where it came from.
// Open each icon, look here, and the impostor is obvious.

export function WhichApp() {
  const [host, setHost] = useState('');
  const [installed, setInstalled] = useState(false);
  // Starts false so a correct install never flashes red on the first paint,
  // and is decided in the effect below because the answer reads window.
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    setHost(window.location.host);
    setWrong(!onCanonicalHost());
    setInstalled(
      window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true,
    );
  }, []);

  // ASKED OF lib/canonical.ts RATHER THAN WORKED OUT AGAIN HERE, and that is
  // the fix rather than a tidy-up.
  //
  // This screen used to compare window.location.host against the SINGULAR
  // CANONICAL_HOST. lib/canonical.ts had already been changed to a LIST for one
  // specific reason: moving to a custom domain is not an instant, and for weeks
  // the old address and the new one are both really the app. The comparison
  // here never learned that. So the day a second host was added, everybody
  // still on the first one would have opened Settings and been told, in red,
  // that they were on a dead deployment which "can never receive a later
  // update" and should uninstall it -- false, and aimed squarely at whoever
  // installed earliest.
  //
  // The helper already folds in the preview refusal and the empty-list case, so
  // trusting it removes the second opinion rather than adding one.

  return (
    // Classes, not inline colours: the same #F9FAFB and #FEF2F2 in Classic,
    // and recoloured with everything else under Beacon, Study and Focus. As an
    // inline white this box kept its white under Focus while its text went
    // pale, and read at 1.1:1 (found 4 October 2026).
    <div className={`rounded-xl p-4 ${wrong ? 'bg-red-50' : 'bg-gray-50'}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
        Which Beacon is this
      </p>
      <p className={`mt-1 font-bold ${wrong ? 'text-red-700' : 'text-navy'}`}>
        {wrong ? 'A one-off deployment address' : 'The home address'}
      </p>
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">Address</dt>
          <dd className="min-w-0 truncate font-mono text-navy">{host || '…'}</dd>
        </div>
        {/* The address to actually use, spelled out. A link labelled "go to the
            home address" is useless to someone who needs to type it on another
            device or bookmark it, and that is exactly the moment this matters. */}
        {wrong && CANONICAL_HOST && (
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Home address</dt>
            <dd className="min-w-0 truncate font-mono font-bold text-red-700">
              {CANONICAL_HOST}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">Build</dt>
          <dd className="min-w-0 truncate font-mono text-navy">{versionLabel()}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">Opened as</dt>
          <dd className="text-navy">{installed ? 'An installed app' : 'A browser tab'}</dd>
        </div>
      </dl>

      {wrong ? (
        <div className="mt-3 text-sm leading-snug text-red-700">
          <p>
            This is one deployment&rsquo;s own permanent address, not the app&rsquo;s
            home address. It has its own storage and can never receive a later
            update. If it is on your taskbar or home screen, uninstall it and
            install from the home address instead.
          </p>
          {CANONICAL_HOST && (
            <a
              href={`https://${CANONICAL_HOST}/settings`}
              className="mt-2 inline-block rounded-lg px-3 py-2 text-sm font-bold text-white"
              style={{ backgroundColor: '#B91C1C' }}
            >
              Go to the home address
            </a>
          )}
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm leading-snug text-gray-500">
            If you have more than one Beacon icon, the others were installed
            from a single deployment&rsquo;s address. Open each one and check this
            panel: only the one showing this address updates itself. The rest
            are safe to uninstall.
          </p>
          {/* Always the production address, never window.location.
              Sharing whatever happens to be in the address bar is how one
              mistake becomes everyone's: paste a preview link to a
              congregation and every person who installs it gets a copy frozen
              at the moment it was shared, with no way to update short of
              uninstalling. */}
          <div className="mt-3">
            <ShareButton
              label="Share Beacon"
              className="py-2 text-sm"
              payload={{
                title: 'Beacon',
                text: 'Walking with Jesus, one step at a time.',
                url: canonicalUrl('/'),
              }}
            />
            <p className="mt-1.5 text-xs text-gray-400">
              Sends the permanent address, so whoever installs it keeps getting
              updates.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

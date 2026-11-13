import { NextResponse } from 'next/server';
import { LATEST_NOTE_ID } from '@/lib/release-notes';
import { BUILD_ID, BUILD_TIME, CANONICAL_HOSTS } from '@/lib/build-info';
import { resolveMinBuildTime } from '@/lib/min-build.mjs';

// The build the SERVER is currently running, as plain JSON.
//
// Why this exists when there is already a service-worker update check: because
// that check can only ever work through the service worker, and a worker that is
// wedged — or one whose script the browser believes is unchanged — reports "no
// update" forever. That is exactly the failure people hit: the app kept saying it
// was current while the server had moved on several releases, and the only way
// out was to uninstall and reinstall.
//
// This route does not care about the worker at all. The page fetches it with
// cache: 'no-store' and a cache-busting query, compares the build id it gets back
// with the one baked into its own bundle at build time, and if they differ it
// KNOWS it is stale — no service-worker cooperation required. That makes the
// check honest even when everything below it has failed.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    {
      build: BUILD_ID,
      time: BUILD_TIME,
      // The oldest build still supported, or null for "no floor", which is the
      // normal state and the default. See lib/min-build.mjs. Read per request
      // rather than baked into a constant, so the value the browser is told is
      // the value this deployment is actually configured with.
      minBuildTime: resolveMinBuildTime(process.env.BEACON_MIN_BUILD_TIME, BUILD_TIME),
      latestNote: LATEST_NOTE_ID,
      // The addresses this build considers its real home, baked in at build
      // time by scripts/stamp-build.mjs. Empty means none was configured, and
      // the frozen-copy warning is inert: an installed copy on a dead address
      // has nothing to compare itself against and will never be told.
      //
      // Reported here because there was no way to check it. Setting
      // CANONICAL_HOST only takes effect at the NEXT build, so "did the
      // redeploy pick it up?" was a question nobody could answer from outside.
      canonicalHosts: CANONICAL_HOSTS,
    },
    {
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
      },
    },
  );
}

'use client';

import { useEffect } from 'react';
import { Card } from '@/components/ui';
import { askWorker, savingData, useKept } from '@/lib/offline-ready';

// One line in Settings: is the whole app on this phone yet?
//
// The owner, 16 October 2026: "How is it still and "offline" first local web
// app if all of the features are not usable offline?" Measured that day with
// the server stopped, 17 of 27 screens and 4 of the 5 Music folders failed,
// while Settings said "Beacon keeps working offline". The worker now keeps all
// of it, and this line says whether it has finished, so somebody can check on
// their own phone before they are somewhere without a signal.
export function KeptForNoSignal() {
  const kept = useKept();

  // Ask for the count as this screen opens, without fetching anything.
  useEffect(() => {
    askWorker(false);
  }, []);

  if (!kept || kept.total === 0) return null;
  const all = kept.kept >= kept.total;
  return (
    <p className={`mt-2 text-sm font-semibold ${all ? 'text-green-800' : 'text-amber-700'}`} data-kept-for-no-signal={all ? 'all' : 'some'}>
      {all
        ? '✓ Every screen and tool is on this device, ready for no signal.'
        : savingData()
          ? `Data Saver is on, so ${kept.total - kept.kept} of ${kept.total} files wait until you open the tool that needs them.`
          : `Getting ready for no signal: ${kept.kept} of ${kept.total} files kept. It finishes on its own while you have a signal.`}
    </p>
  );
}

/** The signed-in Settings' card for it, which has no version card to sit in. */
export function NoSignalCard() {
  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">📶 With no signal</h2>
      <p className="mt-1 text-sm text-gray-600">
        Every screen and tool is kept on this device, so the app opens without a
        connection. What you last saw while signed in is kept too, for you only,
        and forgotten when you sign out. Sending anything waits for a signal.
      </p>
      <KeptForNoSignal />
    </Card>
  );
}

'use client';

// How full the church is, for its leaders, in Settings → Church.
// The words live in lib/space.ts; the numbers in public.church_space().

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import { db } from '@/lib/live/data';
import { isMissingFromDatabase } from '@/lib/live/not-yet';
import { humanError } from '@/lib/live/errors';
import { useKeepUp, KEEP_UP_LIBRARY, KEEP_UP_CHURCH } from '@/lib/live/keep-up';
import { advice, level, planLine, share, size, type ChurchSpace } from '@/lib/space';

const BAR: Record<ReturnType<typeof level>, string> = {
  roomy: 'bg-green-600',
  watch: 'bg-amber-500',
  act: 'bg-red-600',
};

async function readSpace(): Promise<ChurchSpace | null> {
  const { data, error } = await db().rpc('church_space');
  // Before 20261118120000 there is nothing to show, and that is not a fault.
  if (error) {
    if (isMissingFromDatabase(error)) return null;
    throw error;
  }
  const raw = data as Record<string, unknown>;
  // bigint arrives as a number or a string, depending on the data API.
  const n = (k: string) => Number(raw?.[k] ?? 0);
  return {
    plan: raw?.plan === 'paid' ? 'paid' : 'free',
    database_bytes: n('database_bytes'),
    file_bytes: n('file_bytes'),
    database_limit: n('database_limit'),
    file_limit: n('file_limit'),
    person_limit: n('person_limit'),
  };
}

function Meter({ label, used, limit, what, plan }: {
  label: string; used: number; limit: number; what: 'database' | 'files'; plan: ChurchSpace['plan'];
}) {
  const percent = share(used, limit);
  return (
    <div className="mt-4" data-space-meter={what}>
      <p className="font-semibold text-navy">
        {label}: {size(used)} of {size(limit)}
      </p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-1 h-3 w-full overflow-hidden rounded-full bg-gray-100"
      >
        <div className={`h-full rounded-full ${BAR[level(percent)]}`} style={{ width: `${Math.max(percent, 2)}%` }} />
      </div>
      <p className="mt-1 text-sm text-gray-600">{advice(what, percent, plan)}</p>
    </div>
  );
}

export function ChurchSpaceCard() {
  const [space, setSpace] = useState<ChurchSpace | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setSpace(await readSpace()); setError(''); }
    catch (cause) { setError(humanError(cause, 'Could not read how full the church is.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Files are added and removed with resources, posts and notices: the meters follow.
  useKeepUp(KEEP_UP_LIBRARY, load);
  useKeepUp(KEEP_UP_CHURCH, load);

  if (!space && !error) return null;
  return (
    <Card className="p-5" data-panel="church-space">
      <h2 className="mb-1 text-xl font-bold text-navy">📦 Space and plan</h2>
      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : space && (
        <>
          <p className="text-sm text-gray-600">{planLine(space)}</p>
          <Meter label="Records" used={space.database_bytes} limit={space.database_limit} what="database" plan={space.plan} />
          <Meter label="Files and photos" used={space.file_bytes} limit={space.file_limit} what="files" plan={space.plan} />
        </>
      )}
    </Card>
  );
}

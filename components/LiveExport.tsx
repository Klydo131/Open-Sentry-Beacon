'use client';

// Taking the church's own data out of the app.
//
// WHY A CHURCH NEEDS THIS. The data belongs to the congregation, not to us,
// and a church that cannot get a list of its own members out of an app is
// depending on us being here next year. The roster is the file somebody
// actually asks for: names, where they are, who walks with them.
//
// EXPORT ONLY. The tutorial's version can also RESTORE, because its whole
// database is a browser tab and overwriting it costs nothing. Against a real
// congregation, restore means deleting live rows and putting older ones back,
// with a button in a screen, and there is no version of that which is safe
// enough to sit next to Download. Restoring a real project is a database job,
// and the handbook covers it.
//
// EVERY ROW HERE IS A ROW THE READER COULD ALREADY SEE. This builds the file
// from the same calls the screens use, so the export can never widen access:
// it is subject to exactly the policies the person is subject to.

import { useState } from 'react';
import * as live from '@/lib/live/data';
import { Button, Card } from '@/components/ui';
import { stageInfo } from '@/lib/brand';
import { humanError } from '@/lib/live/errors';

function message(cause: unknown): string {
  return humanError(cause, 'That did not work.');
}

/** RFC 4180: quotes doubled, and anything with a comma or newline quoted. */
function cell(value: unknown): string {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(name: string, body: string, mime: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick rather than immediately: Safari has not always
  // finished with the URL by the time click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(name: string | null | undefined): string {
  return (name || 'church').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    + '-' + new Date().toISOString().slice(0, 10);
}

export function LiveExport({ churchName }: { churchName?: string | null }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const roster = async () => {
    setBusy('roster'); setError('');
    try {
      const [members, pairings] = await Promise.all([live.listMembers(), live.listPairings()]);
      const guideOf = new Map(
        pairings.filter((p) => p.status === 'active').map((p) => [p.ds_id, p]),
      );
      const rows = [['Name', 'Role', 'Approved', 'City', 'Guide', 'Journey stage']];
      for (const m of members) {
        const pair = guideOf.get(m.id);
        rows.push([
          m.full_name || '',
          m.role,
          m.is_approved ? 'yes' : 'no',
          m.city_of_residence || '',
          pair?.dm_name || '',
          pair ? stageInfo(pair.journey_stage).label : '',
        ]);
      }
      download(
        `${slug(churchName)}-roster.csv`,
        rows.map((r) => r.map(cell).join(',')).join('\r\n'),
        'text/csv;charset=utf-8',
      );
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(''); }
  };

  const everything = async () => {
    setBusy('all'); setError('');
    try {
      const [members, pairings, church, notices] = await Promise.all([
        live.listMembers(),
        live.listPairings(),
        live.myChurch(),
        live.listAnnouncements().catch(() => []),
      ]);
      // NO MESSAGES AND NO NOTES, and that is not an oversight. A conversation
      // belongs to the two people in it. A Director downloading "everything"
      // must not end up holding what an Explorer told their Guide in
      // confidence, and the safest place to enforce that is here, where the
      // file is built.
      const payload = {
        exported_at: new Date().toISOString(),
        church,
        members,
        pairings,
        announcements: notices,
        omitted: 'Conversations, private notes and prayer requests are '
          + 'deliberately not included: they belong to the people in them.',
      };
      download(
        `${slug(churchName)}-backup.json`,
        JSON.stringify(payload, null, 2),
        'application/json',
      );
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(''); }
  };

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">💾 Your church&rsquo;s data</h2>
      <p className="mt-1 text-sm text-gray-500">
        Take a copy out whenever you want. It is your congregation&rsquo;s
        information, not ours.
      </p>

      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="gold" disabled={!!busy} onClick={() => void roster()}>
          {busy === 'roster' ? 'Preparing…' : 'Download the roster (CSV)'}
        </Button>
        <Button variant="ghost" disabled={!!busy} onClick={() => void everything()}>
          {busy === 'all' ? 'Preparing…' : 'Download everything (JSON)'}
        </Button>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        The roster opens in Excel or Google Sheets. Neither file contains
        conversations, private notes or prayer requests: those belong to the
        people in them, and no export widens what you are allowed to see.
      </p>
    </Card>
  );
}

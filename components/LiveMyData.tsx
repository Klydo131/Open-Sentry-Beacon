'use client';

import { useState } from 'react';
import { useLiveSession } from '@/lib/live/session';
import { collectMyData, myDataFilename } from '@/lib/live/my-data';
import { downloadBlob } from '@/lib/pdf';
import { Button, Card } from '@/components/ui';
import { humanError } from '@/lib/live/errors';

// "Send me everything you have about me."
//
// Both the Philippine Data Privacy Act and the GDPR give a person the right to
// ask, and until today this app had no answer at all. docs/DATA-PROTECTION.md
// listed it as the largest gap that was engineering's to close.
//
// ON THE SCREEN RATHER THAN THROUGH AN EMAIL, because a right that needs
// somebody to answer an email is a right that waits on whoever is busy. The
// file is assembled in the browser from queries this person could already run,
// so nothing new is exposed by it existing.
//
// WHAT IT SAYS ABOUT WHAT IT LEAVES OUT is the part worth reading. A
// safeguarding report about somebody names whoever raised it, and this app
// promises that person the one they reported is never told. So reports are not
// in the file — and the file says so, says why, and says who to ask. An
// omission somebody is told about is a disclosure; the same omission in silence
// is the app deciding on their behalf that they did not need to know.

export function LiveMyData() {
  const { profile } = useLiveSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const download = async () => {
    setBusy(true);
    setError('');
    setDone('');
    try {
      const mine = await collectMyData();
      const file = myDataFilename(profile?.full_name);
      downloadBlob(
        new Blob([JSON.stringify(mine, null, 2)], { type: 'application/json' }),
        file,
      );
      setDone(file);
    } catch (cause) {
      setError(humanError(cause, 'Your copy could not be made just now.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">📦 A copy of your information</h2>
      <p className="mb-4 text-sm text-gray-500">
        Everything this app holds about you, in one file you can keep, read, or take
        somewhere else. It is yours to ask for and you do not have to give a reason.
      </p>

      {error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>}
      {done && (
        <p className="mb-3 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">
          Saved as {done}. Check your downloads.
        </p>
      )}

      <Button onClick={() => void download()} disabled={busy}>
        {busy ? 'Gathering it…' : 'Download my information'}
      </Button>

      <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-gray-700 ring-1 ring-navy/5">
        <p className="font-semibold text-navy">What is in it</p>
        <p className="mt-1">
          Your profile, your conversation with the person walking with you, prayer
          requests you made, meetings you arranged, anything you posted or shared, the
          alerts you were sent, and every change made to your own details.
        </p>
        <p className="mt-3 font-semibold text-navy">What is not, and why</p>
        <p className="mt-1">
          A safeguarding report about you is left out, because a report names whoever
          raised it and they were promised you would not be told unless a Director
          brings you into its conversation; if one has, you can read it in Admin
          Reports. A Guide&rsquo;s private
          notes and the record of approvals and removals are left out for related reasons.
          The file itself explains each one and says who to write to if you want them
          considered: your church&rsquo;s Data Protection Officer, who can weigh it case by
          case.
        </p>
        <p className="mt-3">
          The files you were sent are listed by name and date. The files themselves are
          not inside, because that would make it too large to open on a phone; save them
          from the conversation.
        </p>
      </div>
    </Card>
  );
}

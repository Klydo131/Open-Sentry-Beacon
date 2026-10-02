'use client';

// This Sabbath: the program the church has shared, on every member's phone,
// with or without a signal.
//
// Asked for on 2 October 2026: the Sabbath program "can be share to Explorers
// too", and it must be "accessible to all devices, offline and online". The
// owner chose to send it as a post in the app (see components/SabbathProgram.tsx,
// "Share in the app"), so it arrives under the rules every post already has:
// the sender's name on it, readable only inside the church.
//
// THE PHONE FIRST, THEN THE CHURCH. What this page shows comes from the
// device's own copy before anything is asked of the network, and the copy is
// brought up to date whenever the church can be reached. Signal is weakest in
// a church hall on the Sabbath morning, which is exactly when this is opened.
//
// A leader's own programs are here too, so the editor that lives in the Office
// can also be opened with no signal at all.

import { Card } from '@/components/ui';
import { SabbathPrograms, type ShareInApp } from '@/components/SabbathProgram';
import { EvangelisticMeetings } from '@/components/EvangelisticMeetings';
import { byComingSabbath, dayKey, readShared, sharedDate, dateLabel, type ReceivedProgram } from '@/lib/sabbath-program';

const LEADS_THE_WORK = ['dm', 'admin', 'executive'];

/** One shared program or series of meetings, drawn from its text: the head, then each part's lines. */
function SharedProgram({ program, first, kind = 'program' }: {
  program: ReceivedProgram;
  first: boolean;
  kind?: 'program' | 'meeting';
}) {
  const view = readShared(program.body);
  const [church, ...rest] = view.head;
  const shared = program.at ? new Date(program.at) : null;
  return (
    <article
      className={`bg-white ${first ? '' : 'border-t border-navy/10 pt-4'}`}
      {...{ [kind === 'meeting' ? 'data-received-meeting' : 'data-received-program']: '' }}
    >
      {church && <p className="text-xl font-bold text-navy">{church}</p>}
      {rest.map((line) => <p key={line} className="text-gray-700">{line}</p>)}
      <div className="mt-3 space-y-4">
        {view.parts.map((part) => (
          <section key={part.heading} className="bg-white">
            <h3 className="border-b-2 border-[#c9a227] pb-1 font-bold text-navy">{part.heading}</h3>
            <ul className="mt-1 divide-y divide-navy/10">
              {part.items.map((item, i) => (
                <li key={`${i}-${item}`} className="py-2 text-gray-800">{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-3 text-sm text-gray-600">
        Shared by {program.from || 'your church'}
        {shared && !Number.isNaN(shared.getTime()) ? ` on ${shared.toLocaleDateString()}` : ''}
      </p>
    </article>
  );
}

export function ThisSabbath({ owner, role, churchName, received, meetings, status, share }: {
  owner: string;
  /** The person's role: decides whether their own programs are offered too. */
  role: string | null;
  churchName?: string;
  /** Shared with this person; null while the device's copy is being read. */
  received: ReceivedProgram[] | null;
  /** Evangelistic meetings shared with this person, newest first. */
  meetings?: ReceivedProgram[] | null;
  /** One line on where what is shown came from. */
  status?: string;
  share?: ShareInApp;
}) {
  const today = dayKey(new Date());
  const list = (received ?? []).slice().sort(byComingSabbath(today));
  const [next, ...others] = list;
  return (
    <div className="space-y-5" data-this-sabbath>
      <div>
        <h1 className="text-3xl font-extrabold text-room">🗓️ This Sabbath</h1>
        <p className="mt-1 text-room-soft">The order of service your church has shared, kept on this phone.</p>
      </div>

      <Card className="p-5" data-panel="shared-programs">
        {status && <p role="status" className="mb-3 text-sm text-gray-600">{status}</p>}
        {received === null ? null : next ? (
          <>
            <SharedProgram program={next} first />
            {others.length > 0 && (
              <details className="mt-5 rounded-xl bg-navy/[0.03] p-3">
                <summary className="tap-sm flex cursor-pointer items-center font-bold text-navy">
                  Other Sabbaths ({others.length})
                </summary>
                <ul className="mt-2 space-y-4">
                  {others.map((p) => (
                    <li key={p.id}>
                      <p className="font-semibold text-navy">{dateLabel(sharedDate(p.title)) || p.title}</p>
                      <SharedProgram program={p} first />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <p className="text-gray-700">
            Nothing has been shared with you yet. When your Guide or your church shares a Sabbath
            program, it appears here and stays on this phone, so you can read it without signal.
          </p>
        )}
      </Card>

      {meetings && meetings.length > 0 && (
        <Card className="p-5" data-panel="shared-meetings">
          <h2 className="text-xl font-bold text-navy">📣 Evangelistic meetings</h2>
          <div className="mt-3">
            <SharedProgram program={meetings[0]} first kind="meeting" />
          </div>
          {meetings.length > 1 && (
            <details className="mt-5 rounded-xl bg-navy/[0.03] p-3">
              <summary className="tap-sm flex cursor-pointer items-center font-bold text-navy">
                Shared before ({meetings.length - 1})
              </summary>
              <ul className="mt-2 space-y-4">
                {meetings.slice(1).map((p) => (
                  <li key={p.id}><SharedProgram program={p} first kind="meeting" /></li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}

      {role && LEADS_THE_WORK.includes(role) && (
        <>
          <SabbathPrograms owner={owner} churchName={churchName} role={role} share={share} />
          <EvangelisticMeetings owner={owner} churchName={churchName} role={role} share={share} />
        </>
      )}
    </div>
  );
}

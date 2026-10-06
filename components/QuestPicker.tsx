'use client';

import { useRouter } from 'next/navigation';
import { useDemo } from '@/lib/demo/store';
import { TRACK_LABELS, taskCount, type QuestTrack } from '@/lib/quest';

// "Who are you in your church?"
//
// The demo used to answer that question for you: whichever button you pressed,
// you became Maria Santos and were taught a missionary's work. For the people
// this build is actually being shown to — church directors in their forties who
// have never used an app like this — that is the wrong first thirty seconds. They
// are not missionaries, they will never do a missionary's job, and the one thing
// they needed to learn was not in the tutorial at all.
//
// So the first choice is who you are. Everything after it follows.
//
// One component, used on the front door and in Settings, so the wording and the
// order can never drift between the two places a person meets it.

const TRACKS: { key: QuestTrack; blurb: string; home: string }[] = [
  {
    key: 'executive',
    blurb: 'You watch over the church and want to see how it is doing.',
    home: '/admin',
  },
  {
    key: 'admin',
    blurb: 'You run the church’s account: who gets in, and who walks with whom.',
    home: '/admin',
  },
  {
    key: 'dm',
    blurb: 'You walk with people one to one.',
    home: '/dm',
  },
  {
    key: 'ds',
    blurb: 'Someone from the church is walking with you.',
    home: '/ds',
  },
  // No church board card, and that is the point.
  //
  // There was one, and it opened with "you have no account here" — an option
  // offering itself to somebody it then told to go away. The owner cut it:
  // "take out the church member account since they don't have any account in
  // this app." What the board is shown now lives inside the Admin and Executive
  // accounts, on the Analytics tab, where the person who will actually be asked
  // about it in a board meeting can find it.
];

export function QuestPicker({ onPicked }: { onPicked?: () => void }) {
  const { startTutorial } = useDemo();
  const router = useRouter();

  return (
    <div className="space-y-2 text-left">
      {TRACKS.map((track) => (
        <button
          key={track.key}
          data-quest-track={track.key}
          onClick={() => {
            startTutorial(track.key);
            router.push(track.home);
            onPicked?.();
          }}
          /* No `tap` class: every button already clears the 56px floor from
             globals.css, and these cards are taller than that anyway. */
          className="block w-full rounded-2xl bg-white p-4 text-left ring-1 ring-black/10 transition hover:ring-navy/40"
        >
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-lg font-bold text-navy">{TRACK_LABELS[track.key]}</span>
            {/* The count is per walk now. Naming one number for all of them is
                what once put "4-step" on the front door while the panel counted
                to six. */}
            <span className="shrink-0 text-sm text-gray-500">
              {taskCount(track.key)} steps
            </span>
          </span>
          <span className="mt-0.5 block text-sm leading-snug text-gray-500">
            {track.blurb}
          </span>
        </button>
      ))}
    </div>
  );
}

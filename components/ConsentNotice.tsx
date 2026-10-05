'use client';

import { useRouter } from 'next/navigation';
import { useDemo } from '@/lib/demo/store';
import { NAVY } from '@/lib/brand';

// A one-time, plain-language privacy notice shown to a seeker before they begin.
// Honest about the little activity we keep, clear about who sees what, and it
// requires an explicit "I understand" to continue — trust first.
export function ConsentNotice() {
  const { currentUser, giveConsent, signOut } = useDemo();
  const router = useRouter();
  const me = currentUser!;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <div className="overlay-sheet-tall w-full max-w-lg overflow-y-auto rounded-2xl solid-panel bg-white lift-3">
        <div className="p-6 text-white" style={{ backgroundColor: NAVY }}>
          <div className="text-3xl" aria-hidden>🤝</div>
          <h1 className="mt-2 text-2xl font-extrabold">
            Welcome, {me.full_name.split(' ')[0]}
          </h1>
          <p className="text-white/70">
            Before you begin, here is how your information is cared for.
          </p>
        </div>

        <div className="space-y-3 p-6">
          <Point icon="🔒" text="What you say to your Guide stays between the two of you. Nobody else can read it." />
          <Point icon="📚" text="What you are reading, and how far you have come, is seen by your Guide and your church Director. Nobody else." />
          <Point icon="📊" text="Church leaders see counts only. Never your name, and never what you wrote." />
          <Point icon="🏠" text="Your information stays with the church, not outsiders." />
          <Point icon="💛" text="We keep a little activity (like when you open a reading) so the church can care for you better." />
          <Point icon="🖐️" text="You can change your details whenever you need to. If you ever want to leave, ask a Director and they will remove you." />

          <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-500">
            Questions? Just ask your Guide or the church Director.
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={giveConsent}
              className="tap w-full rounded-xl px-5 text-lg font-bold text-white"
              style={{ backgroundColor: NAVY }}
            >
              I understand, continue
            </button>
            <button
              onClick={() => {
                signOut();
                router.replace('/login');
              }}
              className="tap w-full rounded-xl bg-gray-100 px-5 text-base font-semibold text-gray-600"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Point({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-2xl" aria-hidden>{icon}</span>
      <p className="text-lg text-gray-700">{text}</p>
    </div>
  );
}

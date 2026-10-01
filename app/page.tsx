'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/lib/demo/store';
import { QuestPicker } from '@/components/QuestPicker';
import { FeedbackButton } from '@/components/Feedback';
import { NAVY, TUTORIAL_PURPLE, roleNoun, APP_SHORT_NAME } from '@/lib/brand';
import { Button, Card } from '@/components/ui';
import { useLocale } from '@/lib/i18n';
import type { Role } from '@/lib/types';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { useIsLive } from '@/lib/tutorial';
import { scrollMotion } from '@/lib/motion';
import { LiveHomePage } from '@/components/LiveCorePages';

// The front door, in the order a person actually needs it.
//
// THE PROBLEM THIS LAYOUT SOLVES. This build is two things at once: the real
// app's front end, and a demo of it. An earlier version led with the demo — the
// first button on the page was "Take the tutorial" — which quietly told every
// visitor that this was a toy. Somebody arriving with an invitation from their
// church had to read past a tutorial pitch to find the way in.
//
// So the page is ordered by who is arriving:
//
//   1. THE REAL DOOR, first and alone on the screen. Sign in, or open an
//      invitation. This is what the deployed app looks like, and a member who
//      knows why they are here never has to scroll.
//   2. WHAT IT IS, for somebody deciding.
//   3. THE TUTORIAL AND THE DEMO, on scroll, for somebody evaluating it.
//   4. WHO ARE YOU IN YOUR CHURCH, and feedback, at the bottom — the point at
//      which a visitor has read enough to answer that question honestly.
//
// The order is the message: this is a real app that happens to come with a
// demonstration, not a demonstration wearing an app's clothes.
export default function Home() {
  const live = useIsLive();
  return live ? <LiveHomePage /> : <DemoHome />;
}

function DemoHome() {
  const { currentUser } = useDemo();
  const { t } = useLocale();
  const router = useRouter();

  // No passwords exist in this build, so the reset link explains itself rather
  // than going somewhere. See the note it reveals.
  const [showPasswordNote, setShowPasswordNote] = useState(false);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: scrollMotion(), block: 'start' });

  const HOME: Record<Role, string> = {
    executive: '/admin',
    admin: '/admin',
    dm: '/dm',
    ds: '/ds',
  };

  return (
    <div className="min-h-screen">
      {/* ------------------------------------------------------------------
          1. THE REAL DOOR
          Sized to fill the first screen so nothing below it competes. A member
          arriving from an invitation sees this and nothing else.
      ------------------------------------------------------------------- */}
      <header
        // py-10, not py-16. At 412x900 the taller padding made the hero 921px
        // in a 900px viewport, so the scroll cue — the only thing telling a
        // visitor there is more page — was pushed below the fold on exactly the
        // device most people will open this on.
        // TUTORIAL_PURPLE, not NAVY. This screen and the live front door were
        // pixel-for-pixel the same — same mark, same title, same gold button,
        // same "I have an invitation" — so pressing "Open the tutorial" landed
        // you somewhere indistinguishable from where you started, and the
        // reasonable conclusion was that the button did nothing.
        className="flex min-h-[100svh] flex-col items-center justify-center px-4 py-10 text-center text-white"
        style={{ backgroundColor: TUTORIAL_PURPLE }}
      >
        <div className="mx-auto w-full max-w-md">
          {/* The glow is one radial gradient behind the mark. It costs nothing
              and it is the difference between a logo on a dark rectangle and a
              beacon. */}
          <div className="relative mx-auto w-fit">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -m-16 rounded-full"
              style={{
                background:
                  'radial-gradient(circle, rgba(47,128,237,0.28) 0%, rgba(47,128,237,0) 68%)',
              }}
            />
            <SentryBeaconMark size={92} className="relative mx-auto" />
          </div>

          <h1 className="mt-6 text-5xl font-extrabold tracking-tight">
            {APP_SHORT_NAME}
          </h1>
          <p className="mt-2 text-lg text-white/75">{t('appTagline')}</p>

          {/* Said here as well as in the bar, because this is the screen a
              person forms their first impression on, and the bar is 46px of
              chrome that eyes skip. */}
          <p className="mx-auto mt-5 inline-block rounded-full bg-white/15 px-4 py-1.5 text-sm font-bold tracking-wide">
            🧪 TUTORIAL · sample people
          </p>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/70">
            Everyone in here was invented for you to look around with. Nothing
            is saved anywhere and nothing can reach a real church.
          </p>

          <div className="mt-9">
            {currentUser ? (
              <Button
                variant="gold"
                className="w-full px-7 text-xl"
                onClick={() => router.push(HOME[currentUser.role])}
              >
                Continue as {currentUser.full_name.split(' ')[0]} →
              </Button>
            ) : (
              <Button
                variant="gold"
                className="w-full px-7 text-xl"
                onClick={() => router.push('/login')}
              >
                Choose someone to be →
              </Button>
            )}
          </div>

          <div className="mt-6 space-y-3 text-sm">
            <p>
              <button
                onClick={() => router.push('/join')}
                className="font-semibold text-white underline underline-offset-4"
              >
                I have an invitation
              </button>
            </p>
            <p>
              <button
                onClick={() => setShowPasswordNote((v) => !v)}
                aria-expanded={showPasswordNote}
                className="text-white/70 underline underline-offset-4"
              >
                Forgot your password?
              </button>
            </p>
          </div>

          {showPasswordNote && (
            <p className="mx-auto mt-3 max-w-sm rounded-xl bg-white/10 px-4 py-3 text-left text-sm leading-snug text-white/80">
              This copy has no passwords. Everyone signs in by choosing a sample
              person, because there is no server to hold an account. When you
              connect a real backend, point this at your provider&rsquo;s
              password-reset flow. See <span className="font-mono">docs/BACKENDS.md</span>.
            </p>
          )}

          <p className="mx-auto mt-8 max-w-sm text-sm leading-snug text-white/50">
            {APP_SHORT_NAME} is invitation-only. If your church invited you, open
            the link in your email to set up your account.
          </p>

          {/* The scroll cue. Without it the page looks like it ends here, and
              everything below — the tutorial, the demo, the way to give
              feedback — is never found. */}
          <button
            onClick={() => scrollTo('what-it-is')}
            className="mt-10 inline-flex flex-col items-center gap-1 text-sm text-white/45 hover:text-white/80"
          >
            Just looking? See what it does
            <span aria-hidden className="text-lg leading-none">
              ↓
            </span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-12 px-4 py-14">
        {/* ----------------------------------------------------------------
            2. WHAT IT IS
        ----------------------------------------------------------------- */}
        {/* The six-stage ladder used to be spelled out here, coloured chip by
            coloured chip. The client circled it and asked for it to be hidden
            from seekers, and this page is the one place that cannot be done
            selectively: it is unauthenticated, so there is nobody to check.
            Removing it removes it for admins and missionaries too, who see the
            stages in the app where they actually use them. Stated plainly
            because it is a real trade-off, not a free one. */}
        <section id="what-it-is" className="scroll-mt-6">
          <h2 className="mb-1 text-center text-2xl font-bold text-navy">
            One person, walking with one person
          </h2>
          <p className="text-center text-gray-500">
            {APP_SHORT_NAME} pairs someone exploring faith with one member of the
            church who stays with them: messages, readings, and a conversation
            nobody else can read.
          </p>
        </section>

        <section>
          <h2 className="mb-6 text-center text-2xl font-bold text-navy">
            Everyone has a place
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                r: 'ds',
                icon: '🌱',
                d: 'Explore faith at your own pace, guided by one caring person.',
              },
              {
                r: 'dm',
                icon: '🤝',
                d: 'Walk with your explorers: message, share, and celebrate each step.',
              },
              {
                r: 'admin',
                icon: '🛡️',
                d: 'Approve members, pair people, and keep the library.',
              },
            ].map((x) => (
              <Card key={x.r} className="flex items-start gap-3 p-5">
                <span className="text-3xl" aria-hidden>
                  {x.icon}
                </span>
                <div>
                  <p className="text-lg font-bold text-navy">
                    {roleNoun(x.r)}
                  </p>
                  <p className="text-gray-600">{x.d}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <Card className="p-6">
            <h2 className="text-xl font-bold text-navy">Private by design 🔒</h2>
            <ul className="mt-3 space-y-2 text-gray-600">
              <li>• A Guide sees only their own Explorers.</li>
              <li>
                • An Explorer’s profile is visible only to their Guide and the
                admin.
              </li>
              <li>
                • Leaders see totals and trends only, never anyone’s identity.
              </li>
              <li>
                • Personal data stays on the device; only anonymous totals are
                shared for the church’s own analysis.
              </li>
            </ul>
          </Card>
        </section>

        {/* ----------------------------------------------------------------
            3. THE TUTORIAL AND THE DEMO
            Two ways in for somebody evaluating this, side by side, because
            they answer different questions: "show me my job" and "let me poke
            at everything".
        ----------------------------------------------------------------- */}
        <section id="try-it" className="scroll-mt-6">
          <h2 className="text-center text-2xl font-extrabold text-navy">
            Two ways to try it
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-center text-gray-500">
            Both run on invented people. Nothing you press reaches anybody real,
            and nothing you do here leaves this device.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Card className="flex flex-col p-6">
              <p className="text-3xl" aria-hidden>
                ✦
              </p>
              <h3 className="mt-2 text-xl font-bold text-navy">Tutorial</h3>
              <p className="mt-1 flex-1 text-gray-600">
                A guided walk through <strong>your own job</strong>, one role at a
                time. Ten minutes, on a phone, with an arrow pointing at the next
                thing to press. Written for somebody who has never used the app
                and does not enjoy new software.
              </p>
              <Button
                variant="gold"
                className="mt-4"
                onClick={() => scrollTo('tutorial-picker')}
              >
                ✦ {t('takeTutorial')}
              </Button>
            </Card>

            <Card className="flex flex-col p-6">
              <p className="text-3xl" aria-hidden>
                🎭
              </p>
              <h3 className="mt-2 text-xl font-bold text-navy">Demo</h3>
              <p className="mt-1 flex-1 text-gray-600">
                A whole sample church to explore at your own pace: people,
                messages, lessons, meetings and numbers. Sign in as anybody, and
                switch roles from the header to see the same church through
                somebody else&rsquo;s eyes.
              </p>
              <Button
                variant="ghost"
                className="mt-4"
                onClick={() => router.push('/login')}
              >
                Explore the sample church →
              </Button>
            </Card>
          </div>
        </section>

        {/* ----------------------------------------------------------------
            4. WHO ARE YOU, AND FEEDBACK
            At the bottom on purpose. Asked before a visitor has seen anything,
            this question has no honest answer.
        ----------------------------------------------------------------- */}
        <section id="tutorial-picker" className="scroll-mt-6">
          <h2 className="text-center text-2xl font-extrabold text-navy">
            Who are you in your church?
          </h2>
          <p className="mx-auto mb-4 mt-2 max-w-md text-center text-gray-500">
            Pick the one that fits and we will walk you through your own part.
            Two minutes, on safe demo data. Nothing you press reaches a real
            person.
          </p>
          <div className="mx-auto max-w-md">
            <QuestPicker />
          </div>

          {/* On the front door, not only in Settings. The person most worth
              hearing from is the one who has just decided something is wrong
              and is about to leave. */}
          <div className="mt-8 border-t border-black/5 pt-6">
            <FeedbackButton className="tap" label="Send feedback" />
            <p className="mt-2 text-sm text-gray-400">
              Anything confusing or broken, tell us. It takes a sentence.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/5 py-6 text-center text-sm text-gray-400">
        {APP_SHORT_NAME} · a local-church discipleship app
      </footer>
    </div>
  );
}

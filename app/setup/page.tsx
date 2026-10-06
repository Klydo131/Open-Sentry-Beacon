'use client';

// /setup — the page that tells you what is left to do, and checks.
//
// WHY THIS EXISTS. Everything needed to run a real Hope Beacon already ships in
// this repository: the whole schema, the security rules, the sign-in gateway.
// What was missing was any way to find out WHERE YOU ARE. A developer who had
// done three of the four steps saw exactly what a developer who had done none
// of them saw — the sample-people front door — with nothing on screen to say
// which step was still outstanding or that a step existed at all.
//
// So this page does not explain the project. It answers one question: what do I
// do next? It probes the real connection and names the next action, and it is
// reachable in both modes, because the mode you are in IS the thing you are
// trying to change.
//
// It reads only. It writes nothing, stores nothing, and sends nothing anywhere
// except the one query below, to the database you configured yourself.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { NAVY, APP_SHORT_NAME } from '@/lib/brand';
import { IS_LIVE } from '@/lib/mode';
import { supabase } from '@/lib/supabase/client';
import { humanError } from '@/lib/live/errors';

type Health =
  | { state: 'checking' }
  | { state: 'demo' }
  | { state: 'unreachable'; detail: string }
  | { state: 'no-tables'; detail: string }
  | { state: 'ready' };

/**
 * Ask the database one harmless question and see what comes back.
 *
 * `profiles` is the table every other feature depends on, so its absence is the
 * cleanest signal that the schema has not been applied.
 *
 * TWO ANSWERS MEAN HEALTHY, NOT ONE. An empty list is the obvious one. The
 * other is `42501`, permission denied, which is what a correctly locked-down
 * database says to a visitor who has not signed in: the signed-out role holds
 * no privilege on any table, so the request is refused before Row Level
 * Security is ever consulted. A refusal proves more than an empty list does —
 * the table is there AND the door is shut.
 *
 * This page read that refusal as "unreachable" and told installers their
 * database was broken when it was working exactly as intended. Only an error
 * naming a missing relation means work is outstanding.
 */
async function probe(): Promise<Health> {
  if (!IS_LIVE) return { state: 'demo' };
  const client = supabase();
  if (!client) return { state: 'demo' };

  try {
    const { error } = await client.from('profiles').select('id').limit(1);
    if (!error) return { state: 'ready' };

    const text = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
    // 42P01 is Postgres for "that table is not there".
    if (text.includes('42p01') || text.includes('does not exist') || text.includes('not find the table')) {
      return { state: 'no-tables', detail: error.message };
    }
    // 42501 is "permission denied": the table exists and the signed-out role is
    // being kept out of it, which is the whole point.
    if (text.includes('42501') || text.includes('permission denied')) {
      return { state: 'ready' };
    }
    return { state: 'unreachable', detail: error.message };
  } catch (cause) {
    // A thrown fetch, rather than a returned error, is the network itself
    // saying no: a wrong address, a project that is paused, or a browser
    // refusing the request before it left.
    return {
      state: 'unreachable',
      detail: humanError(cause, 'The request did not complete.'),
    };
  }
}

const DOT: Record<string, string> = {
  done: 'bg-green-600',
  now: 'bg-amber-500',
  todo: 'bg-gray-300',
};

function Step({
  n,
  title,
  status,
  children,
}: {
  n: number;
  title: string;
  status: 'done' | 'now' | 'todo';
  children: React.ReactNode;
}) {
  return (
    <Card className={`p-5 ${status === 'now' ? 'ring-2 ring-amber-400' : ''}`}>
      <div className="flex items-start gap-4">
        <span
          className={`mt-1 flex h-7 w-7 flex-none items-center justify-center rounded-full text-sm font-bold text-white ${DOT[status]}`}
          aria-hidden="true"
        >
          {status === 'done' ? '✓' : n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-navy">
            {title}
            {status === 'done' && <span className="ml-2 text-sm font-semibold text-green-700">done</span>}
            {status === 'now' && <span className="ml-2 text-sm font-semibold text-amber-700">you are here</span>}
          </h2>
          <div className="mt-2 space-y-2 text-gray-600">{children}</div>
        </div>
      </div>
    </Card>
  );
}

function Cmd({ children }: { children: string }) {
  return (
    <code className="block overflow-x-auto rounded-lg bg-gray-100 px-3 py-2 font-mono text-sm text-navy">
      {children}
    </code>
  );
}

export default function Setup() {
  const [health, setHealth] = useState<Health>({ state: 'checking' });

  const check = useCallback(() => {
    setHealth({ state: 'checking' });
    probe().then(setHealth);
  }, []);

  useEffect(() => {
    let alive = true;
    probe().then((h) => alive && setHealth(h));
    return () => {
      alive = false;
    };
  }, []);

  const connected = health.state === 'ready';
  const configured = health.state !== 'demo' && health.state !== 'checking';

  // Which step is the one to do next. Only one is ever highlighted, because a
  // page that highlights three things has told you nothing.
  const at = (n: number): 'done' | 'now' | 'todo' => {
    if (health.state === 'demo') return n === 1 ? 'now' : 'todo';
    if (health.state === 'no-tables') return n < 2 ? 'done' : n === 2 ? 'now' : 'todo';
    if (health.state === 'unreachable') return n === 1 ? 'now' : 'todo';
    if (health.state === 'ready') return n <= 3 ? 'done' : 'now';
    return 'todo';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 py-8 text-center text-white" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto flex max-w-2xl flex-col items-center">
          <Link href="/" className="text-sm text-white/50 underline">
            ← Home
          </Link>
          <SentryBeaconMark size={48} className="mt-3" />
          <h1 className="mt-3 text-3xl font-extrabold">Set up your {APP_SHORT_NAME}</h1>
          <p className="mt-1 text-white/70">
            Four steps to your own church app. No code to write, because the whole thing is already here.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        {/* ------------------------------ status ------------------------------ */}
        <Card className="p-5" data-panel="setup-status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Right now
              </p>
              <p className="mt-1 text-xl font-bold text-navy">
                {health.state === 'checking' && 'Checking…'}
                {health.state === 'demo' && 'Running on sample data'}
                {health.state === 'unreachable' && 'Cannot reach your database'}
                {health.state === 'no-tables' && 'Connected, but the tables are missing'}
                {health.state === 'ready' && 'Connected and ready'}
              </p>
            </div>
            <button
              onClick={check}
              className="tap-sm rounded-xl bg-white px-4 font-semibold text-navy ring-1 ring-navy/20"
            >
              Check again
            </button>
          </div>

          <p className="mt-3 text-gray-600">
            {health.state === 'demo' && (
              <>
                Everything works, but the data lives in this browser and nobody else can see it.
                That is the demo. Follow the steps below to give it a real database.
              </>
            )}
            {health.state === 'unreachable' && (
              <>
                The app has an address and a key, but the request did not get through. Usually the
                address is wrong, the project is paused, or the browser blocked it.
              </>
            )}
            {health.state === 'no-tables' && (
              <>
                The connection works. The database answered, it just has no tables yet, so step 2
                is the one to do.
              </>
            )}
            {health.state === 'ready' && (
              <>
                The app is talking to your database and the tables are there. What is left is
                getting the first person in.
              </>
            )}
          </p>

          {(health.state === 'unreachable' || health.state === 'no-tables') && (
            <p className="mt-3 overflow-x-auto rounded-lg bg-gray-100 px-3 py-2 font-mono text-xs text-gray-600">
              {health.detail}
            </p>
          )}
        </Card>

        {/* ------------------------------- steps ------------------------------- */}
        <Step n={1} title="Create a database and connect it" status={at(1)}>
          <p>
            Make a free project with any Postgres host that offers an auth service. The app is
            built against one, and <Link href="/" className="underline">the docs</Link> name the
            alternatives. Then, in this folder:
          </p>
          <Cmd>npm run setup</Cmd>
          <p>
            It asks two questions, checks your answers, and writes the settings file for you. Both
            answers are on your project&rsquo;s <strong>Settings → API</strong> page.
          </p>
          <p className="text-sm">
            It will stop you if you paste the secret key by mistake. That key bypasses every
            security rule in your database and must never reach a browser.
          </p>
        </Step>

        <Step n={2} title="Create the tables" status={at(2)}>
          <p>
            The whole schema ships in this repository, in <code>supabase/migrations/</code>. Open
            your project&rsquo;s SQL editor and run each file <strong>in filename order</strong>.
            They build on one another, so the order is not optional.
          </p>
          <p className="text-sm">
            The file that matters most is the one holding the security rules. It decides who can
            read what: a Guide sees their own people, an Explorer sees only themselves. Run it and
            read it; it is the part you should understand before real names go in.
          </p>
        </Step>

        <Step n={3} title="Restart the app" status={at(3)}>
          <p>
            Settings are read once when the app starts, so a running app will not notice the file
            you just wrote.
          </p>
          <Cmd>npm run dev</Cmd>
          <p>
            The front door changes: instead of a list of sample people, you get a real e-mail and
            password sign-in.
          </p>
        </Step>

        <Step n={4} title="Make yourself the first administrator" status={at(4)}>
          <p>
            There is no public sign-up. The app is invitation-only by design, which leaves the
            first account a chicken-and-egg problem. Create it directly:
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>In your project, open <strong>Authentication</strong> and add a user with your e-mail and a password.</li>
            <li>In the SQL editor, find that person in <code>profiles</code> and set their role to <code>admin</code> and their approval to true.</li>
          </ol>
          <p>
            Then sign in at <Link href="/login" className="underline">the front door</Link>. From
            there everybody else joins by invitation, which is how it is meant to work.
          </p>
        </Step>

        {connected && (
          <Card className="p-5">
            <h2 className="text-lg font-bold text-navy">Before real people go in</h2>
            <div className="mt-2 space-y-2 text-gray-600">
              <p>
                Sign in as somebody with the least access, an Explorer, and try to reach what
                they should not: another person&rsquo;s conversation, the church list, the admin
                screens. The rules are enforced by the database, not by the screens, so this is a
                real test and not a formality.
              </p>
              <p className="text-sm">
                <code>docs/examples/prove-the-rules.sql</code> does the same thing in SQL, and is
                the faster way to be sure.
              </p>
            </div>
          </Card>
        )}

        {!configured && (
          <p className="px-1 text-sm text-gray-500">
            Nothing on this page is sent anywhere. The check above queries only the database you
            configure yourself, from your own browser.
          </p>
        )}
      </div>
    </div>
  );
}
